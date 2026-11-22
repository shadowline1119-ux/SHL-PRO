import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const tauriDir = path.join(rootDir, 'src-tauri');
const iconsDir = path.join(tauriDir, 'icons');
const confPath = path.join(tauriDir, 'tauri.conf.json');

const expectedIcons = [
  'icons/32x32.png',
  'icons/128x128.png',
  'icons/128x128@2x.png',
  'icons/icon.icns',
  'icons/icon.ico',
];

const presentIcons = expectedIcons.filter((rel) =>
  fs.existsSync(path.join(tauriDir, rel))
);

if (presentIcons.length === 0) {
  console.error(`Brak wygenerowanych ikon w ${iconsDir}.`);
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(confPath, 'utf8'));
cfg.bundle = cfg.bundle || {};
cfg.bundle.icon = presentIcons;
fs.writeFileSync(confPath, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
console.log('Zaktualizowano src-tauri/tauri.conf.json ikonami:', presentIcons.join(', '));
