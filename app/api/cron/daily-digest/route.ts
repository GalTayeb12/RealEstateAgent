/**
 * GET /api/cron/daily-digest
 *
 * Sends the daily email digest to all "daily" frequency alert buyers.
 * Protected by a shared secret — set CRON_SECRET in .env.local.
 *
 * Vercel Cron setup (vercel.json):
 * {
 *   "crons": [
 *     {
 *       "path": "/api/cron/daily-digest",
 *       "schedule": "0 8 * * *"
 *     }
 *   ]
 * }
 *
 * Vercel automatically sets the Authorization header to
 * "Bearer <CRON_SECRET>" when invoking cron jobs.
 * See: https://vercel.com/docs/cron-jobs/manage-cron-jobs
 */

import { NextRequest, NextResponse } from "next/server";
import { sendDailyDigest } from "@/lib/alerts";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("Authorization");

  if (!secret) {
    console.warn("[CRON] CRON_SECRET not set — cron endpoint is unprotected!");
  } else if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sent } = await sendDailyDigest();
  console.log(`[CRON] daily-digest: sent ${sent} emails`);
  return NextResponse.json({ ok: true, sent });
}
