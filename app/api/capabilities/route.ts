// GET /api/capabilities — public platform capability matrix for the dashboard.
import { NextResponse } from "next/server";
import { allAdapters } from "@/lib/platforms";

export async function GET() {
  const platforms = allAdapters().map((a) => ({
    id: a.id,
    name: a.name,
    authType: a.authType,
    capabilities: a.capabilities,
    reviewRequired: a.reviewRequired,
    reviewNote: a.reviewNote ?? null,
    fallbackNote: a.fallbackNote,
    credentialsConfigured: a.credentialsConfigured(),
  }));
  return NextResponse.json({ platforms });
}
