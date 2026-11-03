// supabase data access via PostgREST (fetch-based, no extra dependency).
// server-side only. the anon key is used together with the user's JWT so
// row-level security enforces tenant isolation; service role is used only
// by the cron publisher.
import { supabaseAnonKey, supabaseUrl } from "./session";

export type DbRow = Record<string, unknown>;

async function rest(
  method: string,
  path: string,
  opts: {
    token?: string; // user JWT
    useServiceRole?: boolean;
    body?: unknown;
    prefer?: string;
    searchParams?: Record<string, string>;
  } = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = new URL(`${supabaseUrl()}${path}`);
  for (const [k, v] of Object.entries(opts.searchParams ?? {})) {
    url.searchParams.set(k, v);
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers: Record<string, string> = {
    apikey: opts.useServiceRole && serviceKey ? serviceKey : supabaseAnonKey(),
    "Content-Type": "application/json",
  };
  headers.Authorization = opts.useServiceRole && serviceKey
    ? `Bearer ${serviceKey}`
    : `Bearer ${opts.token ?? supabaseAnonKey()}`;
  if (opts.prefer) headers.Prefer = opts.prefer;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

// ---------- rows ----------

export async function selectRows(
  table: string,
  opts: {
    token: string;
    select?: string;
    filters?: Record<string, string>; // column=value eq filters
    order?: string;
    limit?: number;
  },
): Promise<DbRow[]> {
  const params: Record<string, string> = { select: opts.select ?? "*" };
  for (const [col, val] of Object.entries(opts.filters ?? {})) {
    params[col] = `eq.${val}`;
  }
  if (opts.order) params.order = opts.order;
  if (opts.limit) params.limit = String(opts.limit);
  const res = await rest("GET", `/rest/v1/${table}`, {
    token: opts.token,
    searchParams: params,
  });
  if (!res.ok) throw new Error(`db select ${table} failed: ${res.status}`);
  return (res.data as DbRow[]) ?? [];
}

export async function insertRow(
  table: string,
  token: string,
  row: DbRow,
): Promise<DbRow> {
  const res = await rest("POST", `/rest/v1/${table}`, {
    token,
    body: row,
    prefer: "return=representation",
  });
  if (!res.ok) throw new Error(`db insert ${table} failed: ${res.status}`);
  const rows = (res.data as DbRow[]) ?? [];
  return rows[0] ?? row;
}

export async function insertRows(
  table: string,
  token: string,
  rows: DbRow[],
): Promise<DbRow[]> {
  if (rows.length === 0) return [];
  const res = await rest("POST", `/rest/v1/${table}`, {
    token,
    body: rows,
    prefer: "return=representation",
  });
  if (!res.ok) throw new Error(`db insert ${table} failed: ${res.status}`);
  return (res.data as DbRow[]) ?? [];
}

export async function updateRows(
  table: string,
  token: string,
  filters: Record<string, string>,
  patch: DbRow,
): Promise<DbRow[]> {
  const params: Record<string, string> = {};
  for (const [col, val] of Object.entries(filters)) params[col] = `eq.${val}`;
  const res = await rest("PATCH", `/rest/v1/${table}`, {
    token,
    searchParams: params,
    body: patch,
    prefer: "return=representation",
  });
  if (!res.ok) throw new Error(`db update ${table} failed: ${res.status}`);
  return (res.data as DbRow[]) ?? [];
}

export async function deleteRows(
  table: string,
  token: string,
  filters: Record<string, string>,
): Promise<void> {
  const params: Record<string, string> = {};
  for (const [col, val] of Object.entries(filters)) params[col] = `eq.${val}`;
  const res = await rest("DELETE", `/rest/v1/${table}`, { token, searchParams: params });
  if (!res.ok) throw new Error(`db delete ${table} failed: ${res.status}`);
}

// single-use state row for oauth: insert succeeds only when the state is unique,
// delete returns the row so the caller knows it consumed it exactly once.
export async function consumeOauthState(
  state: string,
  token: string,
): Promise<{ verifier: string | null; redirectTo: string | null } | null> {
  const rows = await selectRows("platform_app_state", {
    token,
    filters: { state },
  });
  const row = rows[0];
  if (!row) return null;
  await deleteRows("platform_app_state", token, { state });
  return {
    verifier: (row.verifier as string) ?? null,
    redirectTo: (row.redirect_to as string) ?? null,
  };
}

// upsert a connected social account by (owner, platform, platform_user_id).
// uses the unique constraint via Prefer resolution=ignore-duplicates is not
// enough (we want update), so: select-then-insert-or-update under rls.
export async function upsertSocialAccount(
  token: string,
  account: {
    owner: string;
    platform: string;
    platform_user_id: string;
    account_name: string;
    avatar_url: string | null;
    scopes: string[];
    status: string;
    access_token_enc: string;
    refresh_token_enc: string | null;
    token_expires_at: string | null;
    meta: Record<string, unknown>;
  },
): Promise<DbRow> {
  const existing = await selectRows("social_accounts", {
    token,
    filters: {
      owner: account.owner,
      platform: account.platform,
      platform_user_id: account.platform_user_id,
    },
    limit: 1,
  });
  if (existing[0]) {
    const updated = await updateRows(
      "social_accounts",
      token,
      { id: String(existing[0].id) },
      {
        account_name: account.account_name,
        avatar_url: account.avatar_url,
        scopes: account.scopes,
        status: account.status,
        access_token_enc: account.access_token_enc,
        refresh_token_enc: account.refresh_token_enc,
        token_expires_at: account.token_expires_at,
        meta: account.meta,
      },
    );
    return updated[0] ?? existing[0];
  }
  return insertRow("social_accounts", token, account);
}

// ---------- cron (service role, bypasses rls; joins done in js) ----------

export async function claimDueJobs(limit: number): Promise<DbRow[]> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set (cron cannot run)");
  const res = await rest("POST", "/rest/v1/rpc/claim_due_jobs", {
    useServiceRole: true,
    body: { p_limit: limit },
  });
  if (res.ok) return (res.data as DbRow[]) ?? [];
  // rpc missing -> fall back to non-atomic claim (acceptable single-runner path)
  const due = await rest("GET", "/rest/v1/publish_jobs", {
    useServiceRole: true,
    searchParams: {
      status: "eq.queued",
      run_at: `lte.${new Date().toISOString()}`,
      order: "run_at.asc",
      limit: String(limit),
      select: "*",
    },
  });
  if (!due.ok) throw new Error(`cron claim failed: ${due.status}`);
  const rows = (due.data as DbRow[]) ?? [];
  const claimed: DbRow[] = [];
  for (const job of rows) {
    // optimistic claim: update only while still queued
    const upd = await rest("PATCH", `/rest/v1/publish_jobs`, {
      useServiceRole: true,
      searchParams: { id: `eq.${job.id}`, status: "eq.queued" },
      body: { status: "claimed", claimed_at: new Date().toISOString(), claimed_by: "cron" },
      prefer: "return=representation",
    });
    const updated = (upd.data as DbRow[]) ?? [];
    if (updated.length > 0) claimed.push(updated[0]);
  }
  return claimed;
}

export async function serviceUpdate(
  table: string,
  filters: Record<string, string>,
  patch: DbRow,
): Promise<DbRow[]> {
  const params: Record<string, string> = {};
  for (const [col, val] of Object.entries(filters)) params[col] = `eq.${val}`;
  const res = await rest("PATCH", `/rest/v1/${table}`, {
    useServiceRole: true,
    searchParams: params,
    body: patch,
    prefer: "return=representation",
  });
  if (!res.ok) throw new Error(`service update ${table} failed: ${res.status}`);
  return (res.data as DbRow[]) ?? [];
}

export async function serviceSelect(
  table: string,
  filters: Record<string, string>,
  select = "*",
): Promise<DbRow[]> {
  const params: Record<string, string> = { select };
  for (const [col, val] of Object.entries(filters)) params[col] = `eq.${val}`;
  const res = await rest("GET", `/rest/v1/${table}`, { useServiceRole: true, searchParams: params });
  if (!res.ok) throw new Error(`service select ${table} failed: ${res.status}`);
  return (res.data as DbRow[]) ?? [];
}

export async function serviceInsert(
  table: string,
  row: DbRow,
): Promise<DbRow> {
  const res = await rest("POST", `/rest/v1/${table}`, {
    useServiceRole: true,
    body: row,
    prefer: "return=representation",
  });
  if (!res.ok) throw new Error(`service insert ${table} failed: ${res.status}`);
  const rows = (res.data as DbRow[]) ?? [];
  return rows[0] ?? row;
}
