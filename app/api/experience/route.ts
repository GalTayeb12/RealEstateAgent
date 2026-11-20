/**
 * GET /api/experience?key=<slug | project id | alias>
 * The project's experience config for client viewers (see lib/experience).
 */
import { NextRequest, NextResponse } from "next/server";
import { getExperience } from "@/lib/experience/getExperience";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const experience = key.length <= 300 ? await getExperience(key) : null;
  if (!experience) return NextResponse.json({ experience: null }, { status: 404 });
  return NextResponse.json({ experience });
}
