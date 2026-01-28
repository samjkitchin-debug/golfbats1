import { NextResponse } from "next/server";

/**
 * DEPRECATED: This route is deprecated and should not be used.
 * Use /me/passport/save instead, which stores passport data in member_passports (canonical source).
 * 
 * This route is kept for backward compatibility but returns 410 Gone.
 */
export async function POST(req: Request) {
  return NextResponse.json(
    { error: "Deprecated. Use /me/passport/save." },
    { status: 410 }
  );
}
