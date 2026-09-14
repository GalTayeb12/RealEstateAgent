import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/**
 * Returns a 400 JSON response with Zod's flattened error details.
 * Use this in every route after a failed safeParse.
 */
export function zodError(err: ZodError) {
  return NextResponse.json(
    { error: "Invalid input", details: err.flatten() },
    { status: 400 }
  );
}
