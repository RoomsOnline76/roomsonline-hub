import { BUILD_SEQ, BUILD_TIME as VITE_BUILD_TIME } from "virtual:app-build-info";

/**
 * Application version / build numbering.
 *
 * The real sequential build number is stored here and NEVER shown to users.
 * The displayed build is always `sequential % 69` (with 0 mapped to 69), so the
 * visible build number is permanently an integer between 1 and 69 inclusive.
 */

/**
 * Internal sequential build number — never displayed.
 *
 * The raw git commit count, resolved the same way TOROFlow does it: the `VITE_COMMIT_COUNT` env
 * channel first, then the `virtual:app-build-info` module from `vite.config.ts`. No anchor offset is
 * applied — an anchor subtraction collapses to 0 in shallow-clone build environments, which is what
 * pinned the badge at `v1.0·69`.
 */
function resolveSequentialBuild(): number {
  const fromEnv = Number(import.meta.env?.VITE_COMMIT_COUNT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  if (Number.isFinite(BUILD_SEQ) && BUILD_SEQ > 0) return BUILD_SEQ;
  return 0;
}

export const SEQUENTIAL_BUILD = resolveSequentialBuild();


/** ISO timestamp of the running build, for tooltips and diagnostics. */
export const BUILD_TIME = VITE_BUILD_TIME;

/** Major version — bumped manually for milestone releases. */
export const VERSION_MAJOR = 1;

const BUILD_MODULUS = 69;

/** Displayed build: modulo-69 of the sequential build, capped to 1..69. */
export function displayedBuild(sequential: number = SEQUENTIAL_BUILD): number {
  const seq = Math.max(0, Math.floor(sequential));
  const mod = seq % BUILD_MODULUS;
  return mod === 0 ? BUILD_MODULUS : mod;
}

/** Minor version — how many full 69-build cycles have completed. */
export function versionMinor(sequential: number = SEQUENTIAL_BUILD): number {
  return Math.floor(Math.max(0, Math.floor(sequential)) / BUILD_MODULUS);
}

/** `v1.13` */
export function versionLabel(sequential: number = SEQUENTIAL_BUILD): string {
  return `v${VERSION_MAJOR}.${versionMinor(sequential)}`;
}

/** `ROL'OS v1.13 · Build 64` */
export function buildLabel(sequential: number = SEQUENTIAL_BUILD): string {
  return `ROL'OS ${versionLabel(sequential)} · Build ${displayedBuild(sequential)}`;
}

/** `ROL'OS v1.13 · Build 64 · 12 Aug 2026 20:17` — used as the badge tooltip. */
export function buildStamp(sequential: number = SEQUENTIAL_BUILD): string {
  const when = new Date(BUILD_TIME);
  const stamped = Number.isNaN(when.getTime())
    ? null
    : when.toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return stamped ? `${buildLabel(sequential)} · ${stamped}` : buildLabel(sequential);
}
