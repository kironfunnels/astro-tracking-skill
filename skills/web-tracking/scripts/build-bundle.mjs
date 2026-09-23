#!/usr/bin/env node
// Builds tracking.js (single IIFE file) for sites without a JavaScript build step: plain HTML, WordPress,
// Elementor, Webflow, Wix custom code. Uses esbuild through npx (downloaded on first use).
//   node <skill>/scripts/build-bundle.mjs --tracking ./tracking --out ./public/tracking.js
// --tracking is the folder copied from templates/core/tracking with config.ts filled in.
// Load the result with <script src="/tracking.js" defer></script> as early as possible in <head>.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const trackingDir = resolve(option('tracking', './tracking'));
const out = resolve(option('out', './tracking.js'));
if (!existsSync(join(trackingDir, 'client.ts'))) {
  console.error(`client.ts não encontrado em ${trackingDir}. Copie templates/core/tracking e preencha config.ts.`);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const entryTemplate = readFileSync(join(here, '../templates/adapters/static/entry.ts'), 'utf8');
// The entry imports ./tracking/...; write it next to the tracking folder under a temporary name.
const entry = join(dirname(trackingDir), `.tracking-entry-${process.pid}.ts`);
writeFileSync(entry, entryTemplate.replaceAll("'./tracking/", `'./${basename(trackingDir)}/`));
try {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(npx, ['--yes', 'esbuild', entry, '--bundle', '--format=iife', '--minify', '--target=es2019', '--legal-comments=none', '--charset=ascii', `--outfile=${out}`], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  console.log(`\nGerado ${out}. Inclua: <script src="/${basename(out)}" defer></script>`);
} finally {
  rmSync(entry, { force: true });
}
