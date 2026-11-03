// Static X (Twitter) post embeds for Writing.
//
// The site ships no third-party JavaScript (DESIGN.md, release budgets), so an
// embed is a quote, not a widget: X's standard `blockquote.twitter-tweet`
// markup with the post text, plus a visible byline and a same-tab link to the
// original post. Nothing loads from x.com, so readers are not tracked and the
// page stays within its request and script budgets.

const STATUS_URL =
  /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,20})\/?(?:[?#].*)?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EM_DASH = String.fromCodePoint(0x2014);
const FIELDS = new Set(['url', 'author', 'handle', 'date', 'lang']);

export class XPostError extends Error {
  constructor(message) {
    super(`x-post: ${message}`);
    this.name = 'XPostError';
  }
}

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Normalize a status link to its canonical https://x.com form, dropping
 * tracking parameters such as `?s=20` and `&t=...`.
 * @param {string} url
 */
export function canonicalStatusUrl(url) {
  const match = STATUS_URL.exec(String(url ?? '').trim());
  if (!match) {
    throw new XPostError(`"url" must be an X post link like https://x.com/name/status/123, found "${url ?? ''}"`);
  }
  return { url: `https://x.com/${match[1]}/status/${match[2]}`, handle: match[1], id: match[2] };
}

function parseDate(value) {
  const match = ISO_DATE.exec(String(value ?? '').trim());
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!date || date.toISOString().slice(0, 10) !== match[0]) {
    throw new XPostError(`"date" must be the post's date as YYYY-MM-DD, found "${value ?? ''}"`);
  }
  return date;
}

/**
 * Validate embed fields and return normalized values.
 * @param {{ url: string, author: string, text: string, date: string, handle?: string, lang?: string }} input
 */
export function normalizeXPost(input) {
  const { url, handle: urlHandle } = canonicalStatusUrl(input.url);
  const author = String(input.author ?? '').trim();
  if (!author) throw new XPostError(`"author" is required (the display name on ${url})`);
  const handle = String(input.handle ?? urlHandle).trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new XPostError(`"handle" must be an X username, found "${input.handle}"`);
  const date = parseDate(input.date);
  const lang = String(input.lang ?? 'en').trim();
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(lang)) throw new XPostError(`"lang" must be a language tag like en, found "${lang}"`);
  const text = String(input.text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!text) throw new XPostError(`the post text is required for ${url}`);
  for (const [name, value] of [['text', text], ['author', author]]) {
    if (value.includes(EM_DASH)) {
      throw new XPostError(`the ${name} for ${url} contains an em dash, which the site never publishes (CONTEXT.md, Punctuation). Decide on a replacement with Kaleb.`);
    }
  }
  return { url, author, handle, date, lang, text };
}

/**
 * Render the static, accessible embed markup.
 * @param {Parameters<typeof normalizeXPost>[0]} input
 * @returns {string}
 */
export function renderXPost(input) {
  const post = normalizeXPost(input);
  const paragraphs = post.text
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${paragraph.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('');
  const isoDate = post.date.toISOString().slice(0, 10);
  const shownDate = post.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const url = escapeHtml(post.url);
  return [
    '<figure class="x-post">',
    `<blockquote class="twitter-tweet" data-dnt="true" data-conversation="none" cite="${url}" lang="${escapeHtml(post.lang)}">${paragraphs}</blockquote>`,
    '<figcaption class="x-post-byline">',
    `<span class="x-post-author">${escapeHtml(post.author)}</span> `,
    `<span class="x-post-handle">@${escapeHtml(post.handle)}</span> `,
    `<a class="x-post-link" href="${url}"><time datetime="${isoDate}">${escapeHtml(shownDate)}</time> on X<span aria-hidden="true"> ↗</span><span class="sr-only"> (external site)</span></a>`,
    '</figcaption>',
    '</figure>',
  ].join('');
}

/**
 * Parse the body of an ```x-post fenced block: `key: value` lines, one blank
 * line, then the post text exactly as written on X.
 * @param {string} source
 */
export function parseXPostBlock(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const fields = {};
  let index = 0;
  for (; index < lines.length && lines[index].trim() !== ''; index += 1) {
    const match = /^([a-z]+):\s*(.*)$/.exec(lines[index].trim());
    if (!match || !FIELDS.has(match[1])) {
      throw new XPostError(`expected a field (${[...FIELDS].join(', ')}) before the blank line, found "${lines[index].trim()}"`);
    }
    fields[match[1]] = match[2];
  }
  return { ...fields, text: lines.slice(index + 1).join('\n') };
}
