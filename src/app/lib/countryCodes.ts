/**
 * ISO-3166 alpha-2 country codes for initial markets
 * Maps country codes (uppercase) to country names
 */
export const COUNTRY_CODES: Record<string, string> = {
  SG: "Singapore",
  MY: "Malaysia",
  ID: "Indonesia",
  TH: "Thailand",
  JP: "Japan",
  AU: "Australia",
  VN: "Vietnam",
  PH: "Philippines",
};

/**
 * Get country name from ISO code
 */
export function getCountryName(code: string): string | null {
  return COUNTRY_CODES[code.toUpperCase()] || null;
}

/**
 * Get all country codes as array for dropdown
 */
export function getCountryOptions(): Array<{ code: string; name: string }> {
  return Object.entries(COUNTRY_CODES)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
