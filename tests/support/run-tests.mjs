// Runs every *.test.mjs file under one tests/ folder with node --test, and
// fails when the folder has fewer test files than expected, so a moved or
// misspelled folder cannot pass with zero tests. No shell globs, so it works
// the same in sh, PowerShell, and cmd.exe.
//
//   node tests/support/run-tests.mjs <folder under the repository root> <minimum files>
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { root } from './root.mjs';

const [folder, minimumText] = process.argv.slice(2);
const minimum = Number(minimumText);
if (!folder || !Number.isInteger(minimum) || minimum < 1) {
  console.error('usage: node tests/support/run-tests.mjs <folder> <minimum test files, at least 1>');
  process.exit(2);
}

const directory = join(root, folder);
const files = existsSync(directory)
  ? readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .sort()
  : [];

if (files.length < minimum) {
  console.error(`run-tests: found ${files.length} test file(s) in ${folder}, expected at least ${minimum}.`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
