import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: { status?: number; headers?: Record<string, string> }) {
  const status = init?.status ?? 200;
  const headers = {
    "Cache-Control": "no-store",
    ...(init?.headers ?? {}),
  };
  return NextResponse.json({ ok: true, data }, { status, headers });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: any,
  init?: { headers?: Record<string, string> }
) {
  const headers = {
    "Cache-Control": "no-store",
    ...(init?.headers ?? {}),
  };
  const payload: any = { ok: false, error: { code, message } };
  if (details !== undefined) payload.error.details = details;

  // Backwards compatibility: some clients expect `error` at top level too
  payload.errorMessage = message;

  return NextResponse.json(payload, { status, headers });
}
