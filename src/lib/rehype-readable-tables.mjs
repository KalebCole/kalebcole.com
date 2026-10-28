import { SKIP, visit } from 'unist-util-visit';

// Keep table semantics while giving wide tables their own keyboard-scroll area.
export default function readableTables() {
  return (tree) => {
    let count = 0;
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'table' || !parent || typeof index !== 'number') return;
      count += 1;
      visit(node, 'element', (cell) => {
        if (cell.tagName === 'th') {
          cell.properties ??= {};
          cell.properties.scope ??= 'col';
        }
      });
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: {
          className: ['article-table-scroll'],
          role: 'region',
          ariaLabel: `Table ${count}`,
          tabIndex: 0,
        },
        children: [node],
      };
      return SKIP;
    });
  };
}
