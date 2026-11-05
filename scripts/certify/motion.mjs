import assert from 'node:assert/strict';
import { join } from 'node:path';
import { collect, matches, root, text } from './helpers.mjs';

// Publication motion, Edge Tilt, Reading Nudge, breakpoint layout settle, and no motion hooks on articles.
export const check = collect('motion', async ({ routes, homepage, globalCss }) => {
  const publicationMotionSource = text(join(root, 'src', 'scripts', 'publication-motion.mjs'));

  const homepageSource = text(join(root, 'src', 'pages', 'index.astro'));
  const projectsSource = text(join(root, 'src', 'pages', 'projects.astro'));

  const breakpointMotionSource = text(join(root, 'src', 'scripts', 'home-breakpoint-motion.mjs'));
  const designSource = text(join(root, 'DESIGN.md'));

  assert.match(publicationMotionSource, /initProjectPointerMotion/, 'publication motion must provide project pointer tracking');
  const finePointerEdgeTilt = globalCss.match(/@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.project-index-row:hover \.project-visual \{[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.doesNotMatch(
    globalCss.match(/\.project-visual\s*\{([\s\S]*?)\n\}/)?.[1] ?? '',
    /(?:--motion-[xy]|perspective|rotate[XY])/,
    'resting project visuals must not apply pointer-position Edge Tilt outside fine-pointer hover',
  );
  assert.match(publicationMotionSource, /translate:/, 'project entrances must continue using translate');
  assert.match(finePointerEdgeTilt, /perspective[\s\S]*?rotateX[\s\S]*?-4deg[\s\S]*?rotateY[\s\S]*?5deg[\s\S]*?translateY\(-6px\)[\s\S]*?box-shadow:/, 'fine-pointer hover must provide bounded tilt, lift, and coral shadow');
  assert.match(globalCss, /@media \(hover: hover\) \{[\s\S]*?\.portrait-mount:hover \{[\s\S]*?box-shadow: 14px 18px 0 var\(--coral\);[\s\S]*?transform: translateY\(-6px\) rotate\(0\);/, 'portrait hover must remain available on hover-capable devices');
  const projectImageBase = globalCss.match(/\.project-visual img\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.doesNotMatch(projectImageBase, /\btransform\s*:/, 'resting project images must remain untransformed');
  assert.match(globalCss, /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.project-index-row:hover \.project-visual img\s*\{[\s\S]*?scale\(1\.055\)[\s\S]*?translate3d\(/, 'only fine-pointer hover may apply project image scale and inverse pointer depth');
  assert.match(globalCss, /\.project-index-row:focus-within \.project-visual\s*\{[\s\S]*?translateY\(-6px\)[\s\S]*?box-shadow: 0 6px 0 var\(--coral\)/, 'keyboard project depth must use a centered fallback');
  assert.match(globalCss, /\.project-index-row:focus-within \.project-visual img\s*\{[\s\S]*?scale\(1\.055\) translate3d\(0, 0, 0\)/, 'keyboard project depth must reset image parallax while preserving scale');
  assert.ok(
    globalCss.indexOf('.project-index-row:focus-within .project-visual') > globalCss.indexOf('.project-index-row:hover .project-visual'),
    'keyboard project depth must cascade after equal-specificity hover depth so focus wins during simultaneous hover',
  );
  assert.match(globalCss, /@media \(pointer: coarse\) \{[\s\S]*?\.project-index-row \.project-visual:active\s*\{[\s\S]*?scale\(\.985\)/, 'coarse pointers must have a pressed project state that can override project hover and focus transforms');
  assert.ok(
    globalCss.indexOf('@media (pointer: coarse)') > globalCss.indexOf('.project-index-row:focus-within .project-visual')
      && globalCss.indexOf('@media (pointer: coarse)') > globalCss.indexOf('.project-index-row:hover .project-visual'),
    'coarse pressed state must cascade after keyboard and hover project states',
  );
  assert.match(globalCss, /\.writing-row:has\(a:hover\),[\s\S]*?\.home-page \.rec:has\(\.rec-title a:hover\)\s*\{[\s\S]*?translateX\(\.55rem\)[\s\S]*?\.writing-row:has\(a:hover\) h3 a,[\s\S]*?color: var\(--blue\);/, 'writing and homepage recommendations must retain their Reading Nudge');
  assert.match(globalCss, /\.home-page \.writing-row:focus-within,[\s\S]*?\.home-page \.rec:focus-within\s*\{[\s\S]*?translateX\(\.55rem\)[\s\S]*?\.home-page \.writing-row:focus-within h3 a,[\s\S]*?color: var\(--blue\);/, 'homepage Reading Nudge must provide the same keyboard focus movement and cobalt title color');
  assert.doesNotMatch(globalCss, /(?:^|\n)\s*\.writing-row:focus-within\s*\{/m, 'keyboard Reading Nudge must not affect writing indexes or article pages');
  assert.match(globalCss, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.project-visual,[\s\S]*?\.project-visual img\s*\{[\s\S]*?transition: none;[\s\S]*?transform: none !important;[\s\S]*?\.project-visual\s*\{[\s\S]*?box-shadow: 6px 7px 0 var\(--coral\);/, 'reduced motion must provide the fixed project Static Mount');
  assert.doesNotMatch(globalCss, /\.prose[^,{]*(?::hover|:active|:focus-within)/, 'article prose must not gain interaction motion');
  assert.match(
    homepageSource,
    /import \{ initHomeBreakpointMotion \} from '\.\.\/scripts\/home-breakpoint-motion\.mjs';[\s\S]*?initHomeBreakpointMotion\(\);/,
    'homepage must initialize the breakpoint layout motion',
  );
  assert.equal(
    matches(homepageSource, /\binitPublicationMotion\(\)/g).length,
    1,
    'homepage must initialize publication motion exactly once',
  );
  assert.doesNotMatch(
    globalCss,
    /\.recent-(?:writing|recommendations)\s*\{\s*animation:/,
    'homepage sections must not retain superseded settle-up entrances outside Publication Story Beats',
  );
  assert.match(
    breakpointMotionSource,
    /translate:[\s\S]*?opacity: 1[\s\S]*?duration: HOME_LAYOUT_MOTION_DURATION/,
    'homepage breakpoint motion must use the approved layout settle',
  );
  assert.match(
    breakpointMotionSource,
    /prefers-reduced-motion: reduce[\s\S]*?reducedMotion: reducedMotion\.matches/,
    'homepage breakpoint motion must honor reduced motion',
  );
  assert.match(breakpointMotionSource, /HOME_COMPACT_MEDIA = '\(min-width: 540px\)'/, 'homepage compact layout settle must use the 540px CSS breakpoint');
  assert.match(breakpointMotionSource, /HOME_PUBLICATION_MEDIA = '\(min-width: 760px\)'/, 'homepage publication layout settle must retain its 760px breakpoint');
  assert.match(breakpointMotionSource, /HOME_LAYOUT_GROUPS[\s\S]*?projects[\s\S]*?writing rows[\s\S]*?pinned writing[\s\S]*?recommendations compact[\s\S]*?recommendations publication/, 'homepage layout settle must map each actual responsive group to its CSS breakpoint');
  assert.match(breakpointMotionSource, /\[data-home-layout-writing-row\][\s\S]*?\[data-home-layout-writing-pinned\][\s\S]*?\[data-home-layout-recommendation\]/, 'homepage layout settle must target actual Writing and Recommendation responsive elements');
  assert.match(breakpointMotionSource, /activeLayoutTargets[\s\S]*?contains/, 'homepage layout settle must coordinate ancestor and descendant Story Beats');
  assert.match(publicationMotionSource, /isHomeLayoutSettling/, 'Publication Story Beats must defer while a homepage layout settle is active');
  assert.match(designSource, /#### Homepage responsive layout settle[\s\S]*?viewport anchoring[\s\S]*?850px[\s\S]*?760px[\s\S]*?540px[\s\S]*?fully opaque[\s\S]*?Reduced motion[\s\S]*?Publication Story Beats/i, 'DESIGN.md must define the canonical viewport-anchored homepage layout-settle contract');
  assert.match(breakpointMotionSource, /findViewportAnchor[\s\S]*?scrollTop \+= displacement/, 'homepage layout settle must synchronously compensate the visible reading anchor without requesting smooth scrolling');
  assert.doesNotMatch(homepage, /\bdata-home-layout-settle\b/i, 'homepage must not emit generic layout-settle wrappers');
  assert.match(homepage, /class="pinned-copy"[^>]*\bdata-home-layout-writing-pinned\b/i, 'homepage pinned Writing copy must be a direct responsive layout target');
  assert.match(homepage, /class="note-mount"[^>]*\bdata-home-layout-writing-pinned\b/i, 'homepage pinned Writing note must be a direct responsive layout target');
  assert.match(homepage, /class="writing-row"[\s\S]*?<div\b[^>]*\bdata-home-layout-writing-row\b[\s\S]*?<time\b[^>]*\bdata-home-layout-writing-row\b/i, 'homepage Writing row copy and date must be direct responsive layout targets');
  assert.match(homepage, /class="rec-visual"[^>]*\bdata-home-layout-recommendation\b[\s\S]*?class="rec-body"[^>]*\bdata-home-layout-recommendation\b/i, 'homepage Recommendation visual and body must be direct responsive layout targets');
  assert.equal(
    matches(homepage, /\bdata-motion-beat\b(?=[^>]*\bdata-home-layout-(?:project|writing-row|writing-pinned|recommendation)\b)|\bdata-home-layout-(?:project|writing-row|writing-pinned|recommendation)\b(?=[^>]*\bdata-motion-beat\b)/gi).length,
    0,
    'homepage layout targets must not share an element with Publication Story Beat hooks',
  );

  for (const [route, path] of routes) {
    if (route.startsWith('/blog/') && route !== '/blog/') {
      assert.doesNotMatch(text(path), /\bdata-motion-beat\b/i, `${route} article output must not contain publication motion hooks`);
    }
  }
});
