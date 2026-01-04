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
