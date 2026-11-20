import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const standaloneDir = path.join(root, '.next', 'standalone');
const staticDir = path.join(root, '.next', 'static');

if (!fs.existsSync(path.join(standaloneDir, 'server.js'))) {
  throw new Error('Standalone server output is missing. Run the Next.js build first.');
}
if (!fs.existsSync(staticDir)) {
  throw new Error('Next.js static build assets are missing. Run the Next.js build first.');
}

fs.cpSync(staticDir, path.join(standaloneDir, '.next', 'static'), {
  recursive: true,
  force: true,
});

const publicDir = path.join(root, 'public');
if (fs.existsSync(publicDir)) {
  fs.cpSync(publicDir, path.join(standaloneDir, 'public'), {
    recursive: true,
    force: true,
  });
}

console.log('Copied static and public assets into the standalone server output.');
