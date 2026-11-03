import { parseXPostBlock, renderXPost } from './x-post.mjs';

/**
 * Markdown authoring for X post embeds. A fenced block with the `x-post`
 * language becomes the static embed from `renderXPost`:
 *
 * ```x-post
 * url: https://x.com/name/status/123
 * author: Display Name
 * date: 2026-11-01
 *
 * The post text, exactly as written.
 * ```
 *
 * It runs before syntax highlighting, so the block never reaches Shiki.
 */
export default function remarkXPost() {
  return (tree, file) => {
    const visit = (node) => {
      if (!Array.isArray(node.children)) return;
      node.children = node.children.map((child) => {
        if (child.type === 'code' && child.lang === 'x-post') {
          try {
            return { type: 'html', value: renderXPost(parseXPostBlock(child.value)), position: child.position };
          } catch (error) {
            const where = file?.path ? `${file.path}:${child.position?.start?.line ?? '?'}` : 'markdown';
            throw new Error(`${where}: ${error.message}`, { cause: error });
          }
        }
        visit(child);
        return child;
      });
    };
    visit(tree);
  };
}
