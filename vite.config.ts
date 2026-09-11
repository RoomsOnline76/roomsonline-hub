import { defineConfig, type Plugin } from "vite";
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
 * Vite's SPA fallback wins over directory-index resolution for public assets.
 * Keep the Channel Manager iframe on its dedicated document during local preview;
 * published hosting serves the physical public/channel-manager/index.html first.
 */
const channelManagerDocumentPlugin = (): Plugin => {
  const installMiddleware: NonNullable<Plugin["configureServer"]> = (server) => {
    server.middlewares.use((request, _response, next) => {
      const url = request.url;
      if (url === "/channel-manager" || url?.startsWith("/channel-manager/")) {
        const queryIndex = url.indexOf("?");
        const query = queryIndex >= 0 ? url.slice(queryIndex) : "";
        request.url = `/channel-manager/index.html${query}`;
      }
      next();
    });
  };

  return {
    name: "channel-manager-document",
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  };
};

export default defineConfig(({ mode }) => {
  const buildSeq = resolveBuildSeq(mode === "production");
  process.env.VITE_COMMIT_COUNT = String(buildSeq);

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      channelManagerDocumentPlugin(),
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
