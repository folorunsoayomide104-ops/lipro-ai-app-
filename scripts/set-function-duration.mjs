#!/usr/bin/env node
/**
 * Nitro's `vercel` preset writes `.vercel/output/functions/*.func/.vc-config.json`
 * with no `maxDuration`, so every function is capped at the platform default
 * (10s on Hobby). Exam/Cards generation can legitimately take longer than
 * that once NVIDIA model fallback is involved (see `src/lib/ai-provider.ts`),
 * so requests were failing with a 504 before the AI call even got a real
 * chance to finish. This patches the Build Output API v3 config directly
 * (a documented, stable field) after `vite build` writes it, since going
 * through Nitro's own (beta, undocumented-for-this-version) config surface
 * risks a silent no-op if the option name is wrong.
 *
 * Safe to run when `.vercel/output` doesn't exist (dev / non-Vercel builds):
 * it's a no-op rather than an error.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const FUNCTIONS_DIR = join(process.cwd(), ".vercel", "output", "functions");
const MAX_DURATION = 60; // Hobby plan's cap; raise only if the account is on Pro+.

async function main() {
  let entries;
  try {
    entries = await readdir(FUNCTIONS_DIR);
  } catch {
    console.log("[set-function-duration] no .vercel/output/functions — skipping.");
    return;
  }

  const funcDirs = entries.filter((name) => name.endsWith(".func"));
  if (funcDirs.length === 0) {
    console.log("[set-function-duration] no .func directories found — skipping.");
    return;
  }

  for (const dir of funcDirs) {
    const configPath = join(FUNCTIONS_DIR, dir, ".vc-config.json");
    let config;
    try {
      config = JSON.parse(await readFile(configPath, "utf8"));
    } catch {
      console.log(`[set-function-duration] no config at ${dir} — skipping.`);
      continue;
    }
    config.maxDuration = MAX_DURATION;
    await writeFile(configPath, JSON.stringify(config, null, 2));
    console.log(`[set-function-duration] set maxDuration=${MAX_DURATION} on ${dir}`);
  }
}

main().catch((err) => {
  console.error("[set-function-duration] failed:", err?.message || err);
  process.exit(1);
});
