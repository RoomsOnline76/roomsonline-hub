import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { componentTagger } from "lovable-tagger";

/**
 * Build sequence — the number of builds so far (same scheme as TOROFlow).
 *
 * Every prompt that changes the project produces exactly one commit, so the git commit count is the
 * natural counter. But the publish environment builds from a truncated clone and only sees a handful
 * of commits, which made the live badge disagree with preview. So the sequence is *committed* to
 * `src/build-seq.json` and the higher of (git count, committed value) wins: git leads in the sandbox
 * (where the file is refreshed so the new number travels with the commit), and the committed file
 * carries the number into the deploy build.
 */
const SEQ_FILE = path.resolve(__dirname, "./src/build-seq.json");

function gitCommitCount(): number {
  try {
    const out = execSync("git rev-list --count HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return Number.parseInt(out.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function storedSeq(): number {
  try {
    const parsed = JSON.parse(fs.readFileSync(SEQ_FILE, "utf8"));
    const seq = Number(parsed?.seq);
    return Number.isFinite(seq) && seq > 0 ? Math.floor(seq) : 0;
  } catch {
    return 0;
  }
}

function resolveBuildSeq(isProductionBuild: boolean): number {
  const stored = storedSeq();
  const git = gitCommitCount();
  const seq = Math.max(stored, git);
  // Never mutate source during a deploy build — only the sandbox advances the counter.
  if (!isProductionBuild && git > stored) {
    try {
      fs.writeFileSync(SEQ_FILE, `${JSON.stringify({ seq: git, stampedAt: new Date().toISOString() })}\n`);
    } catch {
      /* a read-only checkout must not break the build */
    }
  }
  return seq;
}

/**
 * Serve the build stamp as a virtual module rather than a `define`: `define` is not applied to
 * bare identifiers in the dev transform, so the preview would keep showing the fallback.
 */
const buildInfoPlugin = (buildSeq: number) => {
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
export default defineConfig(({ mode }) => {
  const buildSeq = resolveBuildSeq(mode === "production");
  // Also expose it through the standard VITE_* env channel, which survives environments where the
  // virtual module or a bare `define` is not honoured.
  process.env.VITE_COMMIT_COUNT = String(buildSeq);

  return {
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), buildInfoPlugin(buildSeq), mode === "development" && componentTagger()].filter(Boolean),
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
