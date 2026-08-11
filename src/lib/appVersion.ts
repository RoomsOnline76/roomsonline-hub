/**
 * Application version / build numbering.
 *
 * The real sequential build number is stored here and NEVER shown to users.
 * The displayed build is always `sequential % 69` (with 0 mapped to 69), so the
 * visible build number is permanently an integer between 1 and 69 inclusive.
 */

/** Internal sequential build number — increment on each release. Never displayed. */
export const SEQUENTIAL_BUILD = 961;

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
