// DESIGN.md Typography: every web font is a self-hosted WOFF2 with
// font-display: swap. A face with only local() sources is not a web font
// (the metric-matched fallbacks); any face with a url() source is, even when
// it lists local() first.
export function webFontFaceProblems(css) {
  const problems = [];
  for (const face of css.match(/@font-face\s*\{[^}]*\}/gi) ?? []) {
    const sources = [...face.matchAll(/url\(([^)]+)\)/gi)].map((match) => match[1].trim().replace(/^["']|["']$/g, ''));
    if (sources.length === 0) continue;
    if (!/font-display:\s*swap\b/i.test(face)) problems.push(`web font must use font-display: swap (DESIGN.md Typography): ${face.slice(0, 120)}`);
    for (const source of sources) {
      if (!(source.startsWith('/') && source.endsWith('.woff2'))) problems.push(`web font must be a self-hosted WOFF2 file, found ${source}`);
    }
  }
  return problems;
}
