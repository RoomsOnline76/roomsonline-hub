/**
 * Canonical identity helpers for the `properties.external_system` column.
 *
 * The database stores ROL'OS-managed properties as `roomsonline`, but parts of the
 * product (UI copy, docs, some payloads) refer to the same PMS as `rolos`. Every
 * comparison must go through this helper so a property can never be "ROLOS" in one
 * screen and "not ROLOS" in a gate.
 */
export const ROLOS_PMS_ALIASES = ["roomsonline", "rolos", "rol_os", "rolos_pms"] as const;

/** Normalised form of an external_system value (lower case, trimmed). */
export function normalizeExternalSystem(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

/** True when the property is managed by ROL'OS as its PMS. */
export function isRolosPms(value?: string | null): boolean {
  return (ROLOS_PMS_ALIASES as readonly string[]).includes(normalizeExternalSystem(value));
}
