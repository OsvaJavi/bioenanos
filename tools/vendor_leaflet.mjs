// Copy node_modules/leaflet/dist -> web/vendor/leaflet/ (runtime has no CDN; spec P-10, §3.5 M0).
// Runs as npm "postinstall". Idempotent.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'leaflet', 'dist');
const dst = join(root, 'web', 'vendor', 'leaflet');

if (!existsSync(src)) {
  console.error(`[vendor_leaflet] ${src} not found. Run "npm install" first.`);
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(join(root, 'node_modules', 'leaflet', 'package.json'), 'utf8'));
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
// Leaflet's license (BSD-2-Clause) travels with the vendored copy.
const lic = join(root, 'node_modules', 'leaflet', 'LICENSE');
if (existsSync(lic)) cpSync(lic, join(dst, 'LICENSE'));
writeFileSync(join(dst, 'VERSION'), `${pkg.version}\n`);
console.log(`[vendor_leaflet] leaflet ${pkg.version} -> web/vendor/leaflet/`);
