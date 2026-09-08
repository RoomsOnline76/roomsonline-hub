/**
 * Decode a content-quality check result.
 *
 * The channel delivers the result of the minimum content quality check as a
 * base64 payload holding a JSON array of validation errors, e.g.
 *
 *   [{"ValidationErrorCode":"ImageFileNotFound","ValidationErrorExtraData":{"1":true,"3":true}}]
 *
 * Treating that as free text meant a listing with real failures was reported as a
 * pass (the envelope's own Success flag is true whenever the check itself ran).
 */

export interface McqValidationError {
  code: string;
  /** Positions/keys the channel flagged (photo positions for image errors). */
  items: string[];
}

function decodeBase64(value: string): string | null {
  try {
    if (typeof atob === "function") return atob(value);
  } catch {
    return null;
  }
  return null;
}

/** Human, owner-facing sentence for one validation code. */
export function describeMcqValidation(err: McqValidationError): string {
  const where = err.items.length ? ` (photo ${err.items.join(", ")})` : "";
  switch (err.code) {
    case "ImageFileNotFound":
      return `Photos could not be downloaded by the channel${where} — the image links must be publicly reachable.`;
    case "ImageTooSmall":
      return `Photos are below the minimum size${where} — every photo must be at least 1024 × 768 pixels.`;
    case "DescriptionTooShort":
      return "Description is too short — at least 700 characters are required.";
    case "MissingMainImage":
      return "No main photo is selected for the listing.";
    default:
      return `${err.code.replace(/([a-z])([A-Z])/g, "$1 $2")}${where}`;
  }
}

/** Parse a result string that may be base64 JSON, raw JSON, or free text. */
export function decodeMcqResult(resultText: string | null | undefined): {
  errors: McqValidationError[];
  points: string[];
  /** True when the payload was understood and lists no validation errors. */
  clean: boolean;
} {
  const raw = String(resultText ?? "").trim();
  if (!raw) return { errors: [], points: [], clean: false };

  const candidates = [raw];
  if (/^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.length > 8) {
    const decoded = decodeBase64(raw.replace(/\s+/g, ""));
    if (decoded) candidates.push(decoded);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const errors: McqValidationError[] = list
        .filter((e) => e && typeof e === "object")
        .map((e) => {
          const extra = (e as { ValidationErrorExtraData?: Record<string, unknown> }).ValidationErrorExtraData ?? {};
          return {
            code: String((e as { ValidationErrorCode?: unknown }).ValidationErrorCode ?? "").trim(),
            items: Object.entries(extra)
              .filter(([, v]) => v === true || v === "true")
              .map(([k]) => k)
              .sort((a, b) => Number(a) - Number(b)),
          };
        })
        .filter((e) => e.code);
      return { errors, points: errors.map(describeMcqValidation), clean: errors.length === 0 };
    } catch {
      /* not JSON — try the next candidate */
    }
  }

  // Free text: split into individual prompts.
  const points = raw
    .split(/[;\n|]+|,(?=\s*[A-Z])/g)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 1)
    .slice(0, 30);
  return { errors: [], points, clean: false };
}
