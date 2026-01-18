/**
 * Format handicap value to exactly 1 decimal place.
 * 
 * @param value - Handicap value (number, null, or undefined)
 * @returns Formatted string with exactly 1 decimal place (e.g. "18.0", "9.5"), or empty string if null/undefined
 */
export function formatHandicap(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return Number(value).toFixed(1);
}
