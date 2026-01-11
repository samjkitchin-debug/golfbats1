/**
 * Validation Helpers
 * 
 * Single source of truth for field validation rules.
 * Used by both UI (client-side) and API (server-side) for consistent validation.
 */

/**
 * Validates that a value is a non-empty string (required field).
 * 
 * @param value - The value to validate
 * @param fieldLabel - Human-readable field name for error messages (e.g., "Trip name")
 * @returns The trimmed, non-empty string
 * @throws Error if value is null, undefined, or empty/whitespace
 * 
 * Semantics:
 * - null/undefined -> Error: "{fieldLabel} is required"
 * - non-string -> coerced via String(value), then trimmed
 * - empty/whitespace after trim -> Error: "{fieldLabel} cannot be empty"
 */
export function requireNonEmptyString(value: unknown, fieldLabel: string): string {
  if (value === null || value === undefined) {
    throw new Error(`${fieldLabel} is required`);
  }

  const str = String(value).trim();

  if (str.length === 0) {
    throw new Error(`${fieldLabel} cannot be empty`);
  }

  return str;
}

/**
 * Validates that a value is either undefined (field not provided) or a non-empty string (optional field).
 * 
 * @param value - The value to validate
 * @returns The trimmed, non-empty string, or undefined if value was undefined
 * @throws Error if value is null or empty/whitespace
 * 
 * Semantics:
 * - undefined -> return undefined (field not provided, omit from update)
 * - null -> Error: "Field cannot be null" (explicit null not allowed)
 * - non-string -> coerced via String(value), then trimmed
 * - empty/whitespace after trim -> Error: "Field cannot be empty"
 * 
 * Use this for optional fields in PATCH/UPDATE operations where:
 * - undefined = field not provided (do not change)
 * - non-empty string = update to this value
 */
export function optionalNonEmptyString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    throw new Error("Field cannot be null");
  }

  const str = String(value).trim();

  if (str.length === 0) {
    throw new Error("Field cannot be empty");
  }

  return str;
}
