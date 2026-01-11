/**
 * Get the list of admin emails from the ADMIN_EMAILS environment variable.
 * 
 * Format: comma-separated list of emails (case-insensitive)
 * Example: ADMIN_EMAILS="sam.j.kitchin@gmail.com,ashiqinkarim@gmail.com"
 * 
 * Current superusers:
 * - sam.j.kitchin@gmail.com
 * - ashiqinkarim@gmail.com (uuid: 82bc4a80-b863-4329-99a2-ae6412c16c5c)
 */
export function getAdminAllowlist(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || "";
  const emails = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return new Set(emails);
}

export function isEmailAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminAllowlist().has(email.trim().toLowerCase());
}
