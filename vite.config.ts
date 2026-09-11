import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { componentTagger } from "lovable-tagger";

/**
 * Build sequence — the number of builds so far (same scheme as TOROFlow).
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
  if (!isProductionBuild && git > stored) {
    try {
      fs.writeFileSync(SEQ_FILE, `${JSON.stringify({ seq: git, stampedAt: new Date().toISOString() })}\n`);
    } catch {
    }
  }
  return seq;
}

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

/**
 * Rewrites /channel-manager/* to /ru-embed.html in dev mode to support
 * iframe history routes without conflicting with the main SPA router.
 */
const channelManagerRewritePlugin = () => ({
  name: 'channel-manager-rewrite',
  configureServer(server: any) {
    server.middlewares.use((req: any, _res: any, next: any) => {
      if (req.url && req.url.startsWith('/channel-manager/')) {
        const [path, search] = req.url.split('?');
        req.url = '/ru-embed.html' + (search ? '?' + search : '');
      }
      next();
    });
  }
});

export default defineConfig(({ mode }) => {
  const buildSeq = resolveBuildSeq(mode === "production");
  process.env.VITE_COMMIT_COUNT = String(buildSeq);

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      channelManagerRewritePlugin(),
      react(),
      buildInfoPlugin(buildSeq),
      mode === "development" && componentTagger()
    ].filter(Boolean),
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
  };
});
