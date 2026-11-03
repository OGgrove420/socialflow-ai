// publishing engine core: shared by the immediate POST /api/posts path and the
// cron runner. handles validation, idempotency, retry scheduling, status rollup.
import { selectRows, insertRow, insertRows, updateRows, serviceUpdate, serviceSelect } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getAdapter } from "@/lib/platforms";
import type { PublishAccount, PublishInput, PublishOutput } from "@/lib/platforms/types";

export type TargetOutcome = {
  targetId: string;
  accountId: string;
  platform: string;
  status: "published" | "failed" | "needs_reauth" | "skipped_manual";
  remoteId?: string | null;
  remoteUrl?: string | null;
  error?: string | null;
  warnings?: string[];
};

export function backoffDelayMs(attempts: number): number {
  // attempts is the count of failures so far: 1 -> 5min, 2 -> 30min, 3 -> 2h, 4 -> 6h, 5+ -> 24h
  const minutes = [0, 5, 30, 120, 360, 1440][Math.min(attempts, 5)];
  return minutes * 60 * 1000;
}

function isAuthError(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

// publish one post_target. token/source is the user JWT (rls path) unless
// serviceRole is true, in which case updates go through the service client.
export async function publishTarget(
  opts: {
    targetId: string;
    userToken?: string; // rls-scoped session token
    serviceRole?: boolean; // cron path
  },
): Promise<TargetOutcome> {
  const { targetId, userToken, serviceRole } = opts;

  // load target
  const targets = serviceRole
    ? await serviceSelect("post_targets", { id: targetId })
    : await selectRows("post_targets", { token: userToken!, filters: { id: targetId } });
  const target = targets[0] as Record<string, unknown> | undefined;
  if (!target) throw new Error(`target ${targetId} not found`);

  // idempotency: never publish twice remotely
  if (target.status === "published" || target.remote_id) {
    return {
      targetId,
      accountId: String(target.account_id),
      platform: String(target.platform),
      status: "published",
      remoteId: (target.remote_id as string) ?? null,
      remoteUrl: (target.remote_url as string) ?? null,
    };
  }

  // load owning account
  const accounts = serviceRole
    ? await serviceSelect("social_accounts", { id: String(target.account_id) })
    : await selectRows("social_accounts", { token: userToken!, filters: { id: String(target.account_id) } });
  const account = accounts[0] as Record<string, unknown> | undefined;
  if (!account) throw new Error(`account ${target.account_id} not found`);
  if (account.status === "disconnected") {
    return {
      targetId, accountId: String(account.id), platform: String(target.platform),
      status: "failed", error: "account is disconnected",
    };
  }

  // load post body + media
  const posts = serviceRole
    ? await serviceSelect("posts", { id: String(target.post_id) })
    : await selectRows("posts", { token: userToken!, filters: { id: String(target.post_id) } });
  const post = posts[0] as Record<string, unknown> | undefined;
  if (!post) throw new Error(`post ${target.post_id} not found`);

  const adapter = getAdapter(String(target.platform));
  if (!adapter) {
    return {
      targetId, accountId: String(account.id), platform: String(target.platform),
      status: "failed", error: `no adapter for platform ${target.platform}`,
    };
  }

  const updateTarget = async (patch: Record<string, unknown>) => {
    if (serviceRole) await serviceUpdate("post_targets", { id: targetId }, patch);
    else await updateRows("post_targets", userToken!, { id: targetId }, patch);
  };
  const updateAccount = async (patch: Record<string, unknown>) => {
    if (serviceRole) await serviceUpdate("social_accounts", { id: String(account.id) }, patch);
    else await updateRows("social_accounts", userToken!, { id: String(account.id) }, patch);
  };

  const attempts = Number(target.attempts ?? 0) + 1;

  // decrypt the token
  let accessToken: string;
  try {
    accessToken = await decrypt(String(account.access_token_enc));
  } catch {
    await updateTarget({ status: "needs_reauth", attempts, error: "token decryption failed — reconnect the account" });
    return {
      targetId, accountId: String(account.id), platform: String(target.platform),
      status: "needs_reauth", error: "token decryption failed",
    };
  }
  if (!accessToken) {
    await updateTarget({ status: "needs_reauth", attempts, error: "no stored token — reconnect the account" });
    return {
      targetId, accountId: String(account.id), platform: String(target.platform),
      status: "needs_reauth", error: "no stored token",
    };
  }

  const input: PublishInput = {
    caption: (target.caption as string) ?? (post.body as string) ?? "",
    mediaUrls: Array.isArray(post.media_urls) ? (post.media_urls as string[]) : [],
    scheduledAt: (post.scheduled_at as string) ?? null,
  };
  const pubAccount: PublishAccount = {
    platformUserId: String(account.platform_user_id ?? ""),
    accountName: String(account.account_name ?? ""),
    meta: (account.meta as Record<string, unknown>) ?? {},
  };

  await updateTarget({ status: "publishing", attempts });

  try {
    const result: PublishOutput = await adapter.publish(pubAccount, accessToken, input);
    const now = new Date().toISOString();
    await updateTarget({
      status: "published",
      remote_id: result.remoteId ?? null,
      remote_url: result.remoteUrl ?? null,
      published_at: now,
      error: null,
    });
    await updateAccount({ last_publish_at: now, status: "connected" });
    return {
      targetId,
      accountId: String(account.id),
      platform: String(target.platform),
      status: "published",
      remoteId: result.remoteId ?? null,
      remoteUrl: result.remoteUrl ?? null,
      warnings: result.warnings ?? [],
    };
  } catch (err) {
    const e = err as Error & { status?: number; stage?: string };
    const needsReauth = isAuthError(e.status);
    const errorMsg = `${e.message}${e.stage ? ` [${e.stage}]` : ""}`;
    await updateTarget({
      status: needsReauth ? "needs_reauth" : "failed",
      error: errorMsg,
    });
    if (needsReauth) {
      await updateAccount({ status: "reauth_required" });
    }
    return {
      targetId,
      accountId: String(account.id),
      platform: String(target.platform),
      status: needsReauth ? "needs_reauth" : "failed",
      error: errorMsg,
    };
  }
}

// roll a post's status up from its targets
export async function rollupPostStatus(postId: string, userToken?: string, serviceRole?: boolean): Promise<string> {
  const targets = serviceRole
    ? await serviceSelect("post_targets", { post_id: postId })
    : await selectRows("post_targets", { token: userToken!, filters: { post_id: postId } });
  const statuses = (targets as Record<string, unknown>[]).map((t) => String(t.status));
  let status: string;
  if (statuses.length === 0) status = "failed";
  else if (statuses.every((s) => s === "published")) status = "published";
  else if (statuses.some((s) => s === "published")) status = "partial";
  else if (statuses.some((s) => s === "needs_reauth")) status = "partial";
  else status = "failed";
  const patch = { status, updated_at: new Date().toISOString() };
  if (status === "published") {
    (patch as Record<string, unknown>).published_at = new Date().toISOString();
  }
  if (serviceRole) await serviceUpdate("posts", { id: postId }, patch);
  else await updateRows("posts", userToken!, { id: postId }, patch);
  return status;
}

export async function writeAudit(
  userToken: string | undefined,
  serviceRole: boolean,
  owner: string | null,
  action: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    if (serviceRole) {
      const { serviceInsert } = await import("@/lib/db");
      await serviceInsert("audit_log", { owner, action, detail });
    } else if (userToken) {
      await insertRow("audit_log", userToken, { owner, action, detail });
    }
  } catch {
    // audit must never break publishing
  }
}

export async function queueJobForTarget(
  userToken: string,
  targetId: string,
  runAt: string,
): Promise<string> {
  const job = await insertRow("publish_jobs", userToken, {
    target_id: targetId,
    run_at: runAt,
    status: "queued",
  });
  return String(job.id);
}

export { insertRows };
