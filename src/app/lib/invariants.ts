export function invariant(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function safeParseUUID(value: string): string | null {
  return isUUID(value) ? value : null;
}

export function isLegacyNumericId(value: string): boolean {
  // legacy ids are numeric strings (e.g. "123")
  return /^[0-9]+$/.test(value);
}
