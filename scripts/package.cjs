// Package only extension runtime files and the repository license.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'chatgpt-tidy/manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) throw new Error('Package and manifest versions must match.');
const files = ['chatgpt-tidy/manifest.json', 'chatgpt-tidy/content.js', 'chatgpt-tidy/content.css', 'LICENSE'];
for (const file of files) fs.accessSync(path.join(root, file));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const output = `dist/chatgpt-tidy-${manifest.version}.zip`;
fs.rmSync(path.join(root, output), { force: true });
const result = spawnSync('zip', ['-X', output, ...files], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
// Verify the packaged runtime, then update the original download path as well.
for (const file of files) {
  const extracted = spawnSync('unzip', ['-p', output, file], { cwd: root });
  if (extracted.status !== 0 || !extracted.stdout.equals(fs.readFileSync(path.join(root, file)))) {
    throw new Error(`Packaged file differs from source: ${file}`);
  }
}
fs.copyFileSync(path.join(root, output), path.join(root, 'chatgpt-tidy.zip'));
console.log(`Created and verified ${output}; synchronized chatgpt-tidy.zip`);
