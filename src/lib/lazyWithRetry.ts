import { lazy, type ComponentType } from "react";

/**
 * A deploy invalidates the hashed chunk URLs an open tab still holds, so a lazy route import
 * rejects with "Failed to fetch dynamically imported module" and the screen goes blank.
 * Retry the import once (transient network / just-finished deploy), then fall back to a single
 * guarded reload so the tab picks up the fresh manifest instead of showing nothing.
 */
const RELOAD_FLAG = "rol-chunk-reload";

const isStaleChunkError = (error: unknown) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    String((error as Error)?.message ?? error ?? ""),
  );

export function lazyRoute<T extends ComponentType<unknown>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch(async (error: unknown) => {
      if (!isStaleChunkError(error)) throw error;
      try {
        return await factory();
      } catch (retryError) {
        if (typeof sessionStorage !== "undefined" && !sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, "1");
          window.location.reload();
          // Keep the promise pending while the reload happens, so no error surfaces.
          return await new Promise<{ default: T }>(() => {});
        }
        throw retryError;
      }
    }),
  );
}
