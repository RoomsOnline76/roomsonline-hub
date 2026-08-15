import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";
import { componentTagger } from "lovable-tagger";

/**
 * Build sequence — the raw git commit count (same scheme as TOROFlow).
 *
 * Every prompt that changes the project produces exactly one commit, so the commit count is the
 * natural "builds so far" counter. It is used raw: no anchor offset, because an anchor subtraction
 * collapses to 0 in shallow-clone build environments and freezes the badge.
 */
function commitCount(): number {
  try {
    const out = execSync("git rev-list --count HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return Number.parseInt(out.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

const buildSeq = commitCount();

// Also expose it through the standard VITE_* env channel, which survives environments where the
// virtual module or a bare `define` is not honoured.
process.env.VITE_COMMIT_COUNT = String(buildSeq);

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
