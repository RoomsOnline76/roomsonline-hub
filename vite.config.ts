import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";
import { componentTagger } from "lovable-tagger";

/**
 * Build sequence — advances once per prompt/build, never on the clock.
 *
 * Every prompt that changes the project produces exactly one commit, so the commit count is
 * the natural "builds so far" counter. It is anchored to a known display value so the badge
 * continues from where the previous (hour-based) scheme left off, and the displayed number is
 * then the modulo-69 of this sequence (see `src/lib/appVersion.ts`).
 */
const ANCHOR_COMMITS = 13519; // commit count at the anchor below
const ANCHOR_SEQ = 962; // sequential build displayed at that commit count
const commitCount = (() => {
  try {
    const out = execSync("git rev-list --count HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const n = Number.parseInt(out.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
})();
const buildSeq = commitCount === null ? ANCHOR_SEQ : ANCHOR_SEQ + (commitCount - ANCHOR_COMMITS);


/**
 * Serve the build stamp as a virtual module rather than a `define`: `define` is not applied to
 * bare identifiers in the dev transform, so the preview would keep showing the fallback.
 */
const buildInfoPlugin = () => {
  const id = "virtual:app-build-info";
  const resolved = "\0" + id;
  return {
    name: "rol-build-info",
    resolveId(source: string) {
      return source === id ? resolved : null;
    },
    load(loadedId: string) {
      if (loadedId !== resolved) return null;
      return `export const BUILD_SEQ = ${buildSeq};\nexport const BUILD_TIME = ${JSON.stringify(new Date().toISOString())};\n`;
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), buildInfoPlugin(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-motion": ["framer-motion"],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-dropdown-menu",
          ],
        },
      },
    },
  },
}));
