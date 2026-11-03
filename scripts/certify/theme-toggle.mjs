import assert from 'node:assert/strict';
import { join } from 'node:path';
import { collect, root, text } from './helpers.mjs';

// Theme toggle icon states (formerly scripts/certify-theme-toggle.mjs).
export const check = collect('theme-toggle', async () => {
  const component = text(join(root, 'src', 'components', 'ThemeToggle.astro'));
  const styles = text(join(root, 'src', 'styles', 'global.css'));

  assert.doesNotMatch(
    component,
    /data-icon-(?:light|dark)[^>]*\shidden(?:\s|>)/,
    'theme icons must not use the SVG hidden property',
  );
  assert.doesNotMatch(
    component,
    /(?:light|dark)\.hidden\s*=/,
    'theme script must not assign the SVG hidden property',
  );
  assert.match(
    styles,
    /html\[data-mode="light"\]\s+\[data-icon-light\]/,
    'light mode must explicitly display the sun icon',
  );
  assert.match(
    styles,
    /html\[data-mode="dark"\]\s+\[data-icon-dark\]/,
    'dark mode must explicitly display the moon icon',
  );
});
