/**
 * Helper to check if passport feature is enabled.
 * Can be controlled via env var or admin status.
 */
export function isPassportFeatureEnabled(): boolean {
  // Check env var first
  const envEnabled = process.env.NEXT_PUBLIC_PASSPORT_ENABLED === "true";
  if (envEnabled) return true;

  // For now, feature is disabled by default
  // In the future, could check admin status here
  return false;
}

