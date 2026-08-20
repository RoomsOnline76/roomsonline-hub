export type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function samePersistedValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  const empty = (value: unknown) => value === null || value === undefined || value === "";
  if (empty(left) && empty(right)) return true;
  try {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  } catch {
    return false;
  }
}

/** Preserve branches authored by other panels while applying this form's nested values. */
export function mergePersistedRecord(stored: unknown, authored: unknown): JsonRecord {
  const base = isRecord(stored) ? stored : {};
  if (!isRecord(authored)) return { ...base };
  const merged: JsonRecord = { ...base };
  for (const [key, value] of Object.entries(authored)) {
    merged[key] = isRecord(value) ? mergePersistedRecord(base[key], value) : value;
  }
  return merged;
}

/** Build the smallest PostgREST update possible. JSON columns remain atomic but are safely merged. */
export function buildPropertySavePatch(before: JsonRecord | null, submitted: JsonRecord): JsonRecord {
  if (!before) return submitted;
  const patch: JsonRecord = {};
  for (const [key, submittedValue] of Object.entries(submitted)) {
    const nextValue = key === "amenities"
      ? mergePersistedRecord(before.amenities, submittedValue)
      : submittedValue;
    if (!samePersistedValue(before[key], nextValue)) patch[key] = nextValue;
  }
  return patch;
}

export function hasOwnChange(patch: JsonRecord, path: string): boolean {
  let cursor: unknown = patch;
  for (const segment of path.split(".")) {
    if (!isRecord(cursor) || !Object.prototype.hasOwnProperty.call(cursor, segment)) return false;
    cursor = cursor[segment];
  }
  return true;
}