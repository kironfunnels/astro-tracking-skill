#!/usr/bin/env node
// Looks for tracking secrets committed to the project (tokens belong in Cloudflare secrets, never in the repo)
// and for secret files that git would publish. Run before every commit that touches tracking.
//   node <skill>/scripts/scan-secrets.mjs [dir]
// Exit code 1 when something is found.
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', '.astro', '.wrangler', '.git', 'reports', 'test-results', 'playwright-report']);
const PATTERNS = [
  ['Meta access token', /\bEAA[A-Za-z0-9]{60,}/],
  ['Pinterest token', /\bpina_[A-Za-z0-9]{40,}/],
  ['Bearer token literal', /Bearer\s+[A-Za-z0-9._-]{40,}/],
  ['access_token literal', /access_token=[A-Za-z0-9._-]{30,}/],
  ['GA4 api_secret literal', /api_secret\s*[=:]\s*['"]?[\w-]{16,}/],
  ['Secret assignment', /(CAPI|EVENTS|CONVERSIONS)_TOKEN\s*=\s*['"]?[A-Za-z0-9._-]{20,}/],
];

function files() {
  try {
    // Only what git would publish (tracked + untracked, respecting .gitignore).
    return execSync('git ls-files --cached --others --exclude-standard', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch {
    const out = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else out.push(relative(root, path));
      }
    };
    walk(root);
    return out;
  }
}

const findings = [];
for (const file of files()) {
  if (/(^|\/)\.dev\.vars$|(^|\/)\.env(\..+)?$/.test(file) && !file.endsWith('.example')) findings.push(`${file}: arquivo de segredos seria publicado (adicione ao .gitignore)`);
  let text;
  try {
    if (statSync(join(root, file)).size > 2_000_000) continue;
    text = readFileSync(join(root, file), 'utf8');
  } catch {
    continue;
  }
  text.split('\n').forEach((line, index) => {
    for (const [name, pattern] of PATTERNS) if (pattern.test(line)) findings.push(`${file}:${index + 1}: ${name}`);
  });
}

if (findings.length) {
  console.error('Possíveis segredos encontrados:\n' + findings.map((item) => `  - ${item}`).join('\n'));
  console.error('\nMova o valor para um secret da Cloudflare, revogue o token exposto e gere outro.');
  process.exit(1);
}
console.log('Nenhum segredo de rastreamento encontrado.');
