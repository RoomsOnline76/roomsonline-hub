import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { RU_ENDPOINT_LIBRARY, resolveRuEndpoint } from "@/config/ruEndpointLibrary";

/**
 * The traffic monitor grades wire volume against the endpoint library, so a verb implemented in an
 * edge function but missing from the library would be invisible in the cadence review. This test is
 * the guard: it walks the deployed functions and fails when the library falls behind.
 */

const FUNCTIONS_DIR = join(process.cwd(), "supabase", "functions");
const METHOD_RE = /\b(?:Pull|Push)_[A-Za-z]+_RQ\b/g;

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("ruEndpointLibrary", () => {
  it("has no duplicate ids", () => {
    const ids = RU_ENDPOINT_LIBRARY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every channel method implemented in the edge functions", () => {
    const found = new Set<string>();
    for (const file of collectFiles(FUNCTIONS_DIR)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.match(METHOD_RE) ?? []) found.add(match);
    }
    expect(found.size).toBeGreaterThan(40);
    const missing = [...found].filter((method) => !resolveRuEndpoint(method)).sort();
    expect(missing).toEqual([]);
  });
});
