// Loads the production build once. Every site check module reads from this context.
import { readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { blogSource, dist, metaContent, root, routeForHtml, text, walk } from './helpers.mjs';

export function loadContext() {
  const htmlFiles = walk(dist).filter((path) => extname(path) === '.html' && !/^google[a-f0-9]+\.html$/.test(relative(dist, path)));
  const routes = new Map(htmlFiles.map((path) => [routeForHtml(path), path]));
  const page = (route) => (routes.has(route) ? text(routes.get(route)) : undefined);
  const homepage = page('/');
  const cssFiles = walk(dist).filter((path) => extname(path) === '.css');
  const emittedFiles = walk(dist);
  return {
    htmlFiles,
    routes,
    xmlFiles: ['rss.xml', 'recommends/rss.xml'].map((path) => join(dist, path)),
    emittedFiles,
    productionNames: emittedFiles.map((path) => relative(dist, path).replaceAll('\\', '/')),
    expectedRoutes: ['/', '/blog/', '/blog/github-copilot-canvases/', '/blog/hello-world/', '/recommends/', '/projects/', '/404'],
    publishedPostSlugs: readdirSync(blogSource)
      .filter((file) => file.endsWith('.md') && !/^draft:\s*true\s*$/m.test(text(join(blogSource, file))))
      .map((file) => file.replace(/\.md$/, '')),
    homepage,
    homepageImageUrl: homepage === undefined ? undefined : metaContent(homepage, 'property', 'og:image'),
    projectsPage: page('/projects/'),
    writingIndex: page('/blog/'),
    recommends: page('/recommends/'),
    cssFiles,
    builtCss: cssFiles.map(text).join('\n'),
    globalCss: text(join(root, 'src', 'styles', 'global.css')),
    packageJson: JSON.parse(text(join(root, 'package.json'))),
  };
}
