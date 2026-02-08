/**
 * Single source of truth for app version (user-facing, e.g. About page).
 * Set at build time from git commit count (next.config.ts → NEXT_PUBLIC_APP_VERSION).
 */
export const APP_VERSION =
  typeof process.env.NEXT_PUBLIC_APP_VERSION === "string" && process.env.NEXT_PUBLIC_APP_VERSION
    ? process.env.NEXT_PUBLIC_APP_VERSION
    : "0.1.0";
