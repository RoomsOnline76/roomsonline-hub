/// <reference types="vite/client" />

/** Build stamp supplied by the `rol-build-info` plugin in vite.config.ts. */
declare module "virtual:app-build-info" {
  /** Internal sequential build number — advances with every build. Never displayed raw. */
  export const BUILD_SEQ: number;
  /** ISO timestamp of the running build. */
  export const BUILD_TIME: string;
}
