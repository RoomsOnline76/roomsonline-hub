import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hydrateOriginFromUrl } from "./lib/bookingOrigin";

hydrateOriginFromUrl();

/**
 * A deploy/HMR rebuild invalidates the hashed chunk URLs an already-open tab still holds, so the
 * next lazy route import fails with "Failed to fetch dynamically imported module" and the screen
 * goes blank. Reload once (guarded by sessionStorage so a genuine failure can't loop) to pick up
 * the fresh manifest.
 */
const RELOAD_FLAG = "rol-chunk-reload";
const isStaleChunkError = (message: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );

const recoverFromStaleChunk = (message: string) => {
  if (!isStaleChunkError(message)) return;
  if (sessionStorage.getItem(RELOAD_FLAG)) return;
  sessionStorage.setItem(RELOAD_FLAG, "1");
  window.location.reload();
};

window.addEventListener("error", (event) => recoverFromStaleChunk(String(event.message ?? "")));
window.addEventListener("unhandledrejection", (event) =>
  recoverFromStaleChunk(String((event.reason as Error)?.message ?? event.reason ?? "")),
);
window.setTimeout(() => sessionStorage.removeItem(RELOAD_FLAG), 10000);

createRoot(document.getElementById("root")!).render(<App />);
