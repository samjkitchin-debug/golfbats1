import process from "node:process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Agent, setGlobalDispatcher } from "undici";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const envFile = readFileSync(filePath, "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
      }
    }
  }
}
loadEnvFile(join(process.cwd(), ".env.local"));
loadEnvFile(join(process.cwd(), ".env"));

const BASE_URL = (process.env.INGEST_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.ADMIN_INGEST_SECRET;
const FORCE = process.env.INGEST_FORCE === "1" || process.env.INGEST_FORCE === "true";
const TIMEOUT_MS = Number(process.env.INGEST_TIMEOUT_MS || "900000");
const UNDICI_TIMEOUT_MS = Number(process.env.INGEST_UNDICI_TIMEOUT_MS || "1800000"); // 30 min

setGlobalDispatcher(
  new Agent({
    headersTimeout: UNDICI_TIMEOUT_MS,
    bodyTimeout: UNDICI_TIMEOUT_MS,
    connectTimeout: 30000,
  })
);

const HEARTBEAT_MS = 15000;

if (!SECRET) {
  console.error("Missing ADMIN_INGEST_SECRET in environment.");
  console.error("Set it in your shell or .env.local (and restart dev server if needed).");
  process.exit(1);
}

const url = `${BASE_URL}/api/admin/golfcourseapi/ingest-sea`;

async function main() {
  console.log(`[ingest:sea] undici headers/body timeout = ${UNDICI_TIMEOUT_MS}ms`);
  console.log(`[ingest:sea] POST ${url} force=${FORCE} timeout=${TIMEOUT_MS}ms base_url=${BASE_URL}`);

  const controller = new AbortController();
  const startedAt = Date.now();
  const heartbeat = setInterval(() => {
    const secs = Math.floor((Date.now() - startedAt) / 1000);
    console.log(`[ingest:sea] waiting... ${secs}s elapsed`);
  }, HEARTBEAT_MS);

  const timeout = setTimeout(() => {
    controller.abort(new Error(`Timed out after ${TIMEOUT_MS}ms`));
  }, TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-secret": SECRET,
      },
      body: JSON.stringify({ force: FORCE }),
      signal: controller.signal,
    });
  } catch (err) {
    console.error("[ingest:sea] fetch error name:", err?.name);
    console.error("[ingest:sea] fetch error message:", err?.message);
    if (err?.cause) console.error("[ingest:sea] fetch error cause:", err.cause);
    if (err?.stack) console.error("[ingest:sea] fetch error stack:", String(err.stack).split("\n").slice(0, 4).join("\n"));
    throw err;
  } finally {
    clearInterval(heartbeat);
    clearTimeout(timeout);
  }

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    console.error(`[ingest:sea] HTTP ${res.status}`);
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(json, null, 2));
}

main().catch((e) => {
  if (e?.name === "AbortError" || e?.message?.includes("Timed out")) {
    console.error("[ingest:sea] Request aborted (timeout). Try increasing INGEST_TIMEOUT_MS or maxDuration in route.ts.");
  } else {
    console.error("[ingest:sea] Failed:", e?.message ?? e);
  }
  process.exit(1);
});
