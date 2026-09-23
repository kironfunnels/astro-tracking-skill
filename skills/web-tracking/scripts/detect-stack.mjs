#!/usr/bin/env node
// Detects the stack of a local project (framework, rendering mode, host) and prints which templates to use.
//   node <skill>/scripts/detect-stack.mjs [dir]
// For a live site without the code, audit-site.mjs also reports the stack it sees from HTML and headers.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? process.cwd();
const has = (...paths) => paths.some((path) => existsSync(join(root, path)));
const read = (path) => {
  try {
    return readFileSync(join(root, path), 'utf8');
  } catch {
    return '';
  }
};
const firstExisting = (...paths) => paths.find((path) => existsSync(join(root, path)));

let pkg = {};
try {
  pkg = JSON.parse(read('package.json') || '{}');
} catch {
  /* invalid package.json */
}
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const dep = (name) => Boolean(deps[name]);

// ---------- framework ----------
let framework = 'desconhecido';
let notes = [];
if (dep('astro')) {
  framework = 'astro';
  const config = read(firstExisting('astro.config.mjs', 'astro.config.ts', 'astro.config.js') ?? '');
  const adapter = ['cloudflare', 'vercel', 'netlify', 'node'].find((name) => dep(`@astrojs/${name}`));
  notes.push(adapter ? `adapter @astrojs/${adapter}` : 'sem adapter (site estático)');
  if (/output\s*:\s*['"]server['"]/.test(config)) notes.push("output: 'server'");
} else if (dep('next')) {
  framework = 'next';
  notes.push(has('app', 'src/app') ? 'App Router' : has('pages', 'src/pages') ? 'Pages Router' : 'roteador não identificado');
  if (/output\s*:\s*['"]export['"]/.test(read(firstExisting('next.config.js', 'next.config.mjs', 'next.config.ts') ?? ''))) notes.push("output: 'export' (estático, sem rotas de API)");
} else if (dep('nuxt')) {
  framework = 'nuxt';
  notes.push(has('app/app.vue', 'app/pages') ? 'estrutura Nuxt 4 (app/)' : 'estrutura Nuxt 3');
} else if (dep('@sveltejs/kit')) {
  framework = 'sveltekit';
  const adapter = Object.keys(deps).find((name) => name.startsWith('@sveltejs/adapter-'));
  if (adapter) notes.push(adapter);
} else if (dep('@remix-run/react') || dep('react-router') && has('app/root.tsx', 'app/root.jsx')) {
  framework = 'react-router/remix';
} else if (dep('gatsby')) {
  framework = 'gatsby';
} else if (dep('@angular/core')) {
  framework = 'angular (SPA)';
} else if (dep('vite') && (dep('react') || dep('vue') || dep('svelte') || dep('solid-js') || dep('preact'))) {
  framework = 'vite-spa';
  notes.push(['react', 'vue', 'svelte', 'solid-js', 'preact'].filter(dep).join(', '));
} else if (has('wp-config.php', 'wp-content')) {
  framework = 'wordpress';
} else if (has('layout/theme.liquid', 'config/settings_schema.json')) {
  framework = 'shopify-theme';
} else if (has('composer.json') && read('composer.json').includes('laravel/framework')) {
  framework = 'laravel';
} else if (has('Gemfile') && read('Gemfile').includes('rails')) {
  framework = 'rails';
} else if (has('manage.py')) {
  framework = 'django';
} else if (has('index.html') || readdirSync(root).some((name) => name.endsWith('.html'))) {
  framework = 'html-estatico';
}

// ---------- host ----------
const hosts = [];
if (has('wrangler.toml', 'wrangler.json', 'wrangler.jsonc') || dep('wrangler') || has('functions')) hosts.push('cloudflare');
if (has('vercel.json', '.vercel') || dep('@vercel/functions')) hosts.push('vercel');
if (has('netlify.toml', 'netlify') || dep('@netlify/functions')) hosts.push('netlify');
if (has('firebase.json')) hosts.push('firebase');
if (has('Dockerfile', 'docker-compose.yml', 'compose.yaml')) hosts.push('docker/servidor próprio');
if (!hosts.length) hosts.push('não identificado (pergunte ao usuário)');

// ---------- existing tracking ----------
const existing = [];
const scanFiles = ['src', 'app', 'pages', 'components', 'layouts', 'public', 'index.html'].filter((path) => existsSync(join(root, path)));
const grepTargets = /fbq\(|gtag\(|GTM-|ttq\.|pintrk\(|uetq|lintrk|dataLayer/;
function walk(dir, depth = 0) {
  if (depth > 5 || existing.length > 20) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (['node_modules', 'dist', '.next', '.nuxt', '.svelte-kit', '.astro', '.output', 'build'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, depth + 1);
    else if (/\.(astro|tsx?|jsx?|vue|svelte|html|php|liquid|mjs)$/.test(entry.name) && grepTargets.test(readFileSync(path, 'utf8'))) existing.push(path.slice(root.length + 1));
  }
}
for (const path of scanFiles) {
  const full = join(root, path);
  if (path.endsWith('.html')) {
    if (grepTargets.test(read(path))) existing.push(path);
  } else walk(full);
}

// ---------- recommendation ----------
const RECOMMEND = {
  astro: 'adapters/astro (Tracking.astro) + relay: cloudflare-pages (estático no Pages), astro/cloudflare-workers ou astro/other-hosts',
  next: 'adapters/next (components/Tracking.tsx + app/api/events/route.ts), spa: true',
  nuxt: 'adapters/nuxt (plugins/tracking.client.ts + server/api/events.ts), spa: true',
  sveltekit: 'adapters/sveltekit (hooks.client.ts + routes/api/events/+server.ts), spa: true',
  'vite-spa': "import './tracking/client' no main.ts, spa: true + relay do host: cloudflare-pages, vercel ou netlify",
  'react-router/remix': "import do client num efeito do root + rota de recurso chamando handleRelay; spa: true",
  gatsby: 'gatsby-browser.js importando o client (spa: true) + relay do host',
  'angular (SPA)': "import do client no main.ts, spa: true + relay do host",
  wordpress: 'build-bundle.mjs → tracking.js enfileirado no tema/plugin + relay em cloudflare-worker (ou endpoint PHP próprio)',
  'shopify-theme': 'prefira os apps oficiais (Meta, Google & YouTube, TikTok) que já fazem CAPI; runtime só para eventos extras',
  laravel: 'build-bundle.mjs ou Vite do projeto + relay: rota do Laravel repassando para as APIs, ou cloudflare-worker',
  rails: 'build-bundle.mjs ou bundler do projeto + relay: controller próprio ou cloudflare-worker',
  django: 'build-bundle.mjs + relay: view própria ou cloudflare-worker',
  'html-estatico': 'build-bundle.mjs → tracking.js + relay do host (cloudflare-pages, vercel, netlify) ou cloudflare-worker',
  desconhecido: 'pergunte ao usuário como o site é gerado e publicado; veja references/stacks.md',
};

console.log(JSON.stringify({ root, framework, notes, hosts, existingTracking: existing, recommendation: RECOMMEND[framework] ?? RECOMMEND.desconhecido }, null, 2));
