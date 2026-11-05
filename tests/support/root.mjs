// The repository root, found by walking up from this file to the package.json
// named kalebcole-site, so it does not depend on how deep a test file sits.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function findRoot(start) {
  for (let directory = start; ; directory = dirname(directory)) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === 'kalebcole-site') return directory;
    if (dirname(directory) === directory) throw new Error(`could not find the kalebcole-site package.json above ${start}`);
  }
}

export const root = findRoot(dirname(fileURLToPath(import.meta.url)));
export const dist = join(root, 'dist');
export const fixtures = join(root, 'tests', 'fixtures');
