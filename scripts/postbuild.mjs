#!/usr/bin/env node
/*
 * postbuild.mjs
 *
 * Vite is configured (in vite.config.ts) to emit static assets to
 * `dist/public`. Azure Static Web Apps expects a flat `dist/` output, so
 * after every build we:
 *   1. Move the contents of dist/public up into dist/.
 *   2. Remove the now-empty dist/public.
 *   3. Copy staticwebapp.config.json (from the project root) into dist/
 *      so the SPA fallback + headers ship with the build artifact.
 */
import {
  cpSync,
  existsSync,
  readdirSync,
  renameSync,
  rmSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");
const distPublic = join(dist, "public");
const swaConfigSrc = join(root, "staticwebapp.config.json");
const swaConfigDest = join(dist, "staticwebapp.config.json");

if (!existsSync(dist)) {
  mkdirSync(dist, { recursive: true });
}

if (existsSync(distPublic)) {
  // Move every entry from dist/public into dist/, then drop dist/public.
  for (const entry of readdirSync(distPublic)) {
    const from = join(distPublic, entry);
    const to = join(dist, entry);
    if (existsSync(to)) {
      rmSync(to, { recursive: true, force: true });
    }
    try {
      renameSync(from, to);
    } catch {
      // Cross-device fallback (rare in the sandbox, but cheap to guard).
      cpSync(from, to, { recursive: true });
      rmSync(from, { recursive: true, force: true });
    }
  }
  rmSync(distPublic, { recursive: true, force: true });
}

if (existsSync(swaConfigSrc)) {
  copyFileSync(swaConfigSrc, swaConfigDest);
  console.log("postbuild: copied staticwebapp.config.json → dist/");
} else {
  console.warn("postbuild: staticwebapp.config.json not found at project root");
}

// Strip Manus dev-only runtime + dev asset folders from the production
// artifact. They are injected by the local Vite plugin for the in-sandbox
// preview but should never ship to Azure.
const indexHtmlPath = join(dist, "index.html");
if (existsSync(indexHtmlPath)) {
  let html = readFileSync(indexHtmlPath, "utf8");
  const before = html.length;
  html = html.replace(
    /<script id="manus-runtime"[\s\S]*?<\/script>\s*/i,
    "",
  );
  html = html.replace(
    /<script[^>]*src="\/__manus__\/[^"]*"[^>]*>\s*<\/script>\s*/gi,
    "",
  );
  html = html.replace(
    /<script[^>]*src="[^"]*manus-analytics[^"]*"[^>]*>\s*<\/script>\s*/gi,
    "",
  );
  writeFileSync(indexHtmlPath, html, "utf8");
  console.log(
    `postbuild: stripped Manus dev injections from index.html (${before} → ${html.length} bytes)`,
  );
}

const manusDir = join(dist, "__manus__");
if (existsSync(manusDir)) {
  rmSync(manusDir, { recursive: true, force: true });
  console.log("postbuild: removed dist/__manus__");
}

const gitkeep = join(dist, ".gitkeep");
if (existsSync(gitkeep)) {
  rmSync(gitkeep, { force: true });
}

console.log("postbuild: dist/ is ready for Azure Static Web Apps");
