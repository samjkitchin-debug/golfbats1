export function isSupabaseConfigured() {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function getClubSlug() {
  return process.env.NEXT_PUBLIC_CLUB_SLUG || "golfbats";
}
