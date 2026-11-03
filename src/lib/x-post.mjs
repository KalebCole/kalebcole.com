// Static X (Twitter) post cards for Writing.
//
// The site ships no third-party JavaScript (DESIGN.md, release budgets), so an
// embed is a static card, not a widget: X's standard `blockquote.twitter-tweet`
// markup for the post text inside a card that looks like an X post (avatar,
// name, badge, handle, X mark, reply context, time, and actions). Nothing loads
// from x.com: the avatar is a self-hosted copy, and every action is a plain
// same-tab link, except Copy link, which a first-party script enables.

const STATUS_URL =
  /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,20})\/?(?:[?#].*)?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?Z$/;
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const LOCAL_AVATAR = /^\/[A-Za-z0-9/_.-]+\.(?:webp|png|jpe?g|avif)$/;
const EM_DASH = String.fromCodePoint(0x2014);
const FIELDS = new Set(['url', 'author', 'handle', 'date', 'lang', 'avatar', 'verified', 'replyto', 'likes', 'replies', 'caption', 'captionurl']);

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

// A post date is YYYY-MM-DD, or a UTC time as YYYY-MM-DDTHH:MM[:SS]Z. Times
// show in UTC, the same as recommendation dates (DESIGN.md, Recommends).
function parseDate(value) {
  const raw = String(value ?? '').trim();
  const day = ISO_DATE.exec(raw);
  const time = ISO_DATE_TIME.exec(raw);
  const parts = day ?? time;
  if (parts) {
    const [, y, mo, d, h = '0', mi = '0', s = '0'] = parts;
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
    const roundTrip = date.toISOString();
    if (roundTrip.slice(0, 10) === `${y}-${mo}-${d}` && (!time || roundTrip.slice(11, 16) === `${h}:${mi}`)) {
      return { date, hasTime: Boolean(time) };
    }
  }
  throw new XPostError(`"date" must be the post's date as YYYY-MM-DD or its UTC time as YYYY-MM-DDTHH:MMZ, found "${value ?? ''}"`);
}

function parseCount(name, value) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const raw = String(value).trim();
  if (!/^\d{1,12}$/.test(raw)) throw new XPostError(`"${name}" must be a whole number, found "${raw}"`);
  return Number(raw);
}

function parseBoolean(name, value) {
  if (value === undefined || value === null || value === '' || value === false) return false;
  if (value === true || value === 'true') return true;
  if (value === 'false') return false;
  throw new XPostError(`"${name}" must be true or false, found "${value}"`);
}

/**
 * Validate embed fields and return normalized values.
 * @param {{ url: string, author: string, text: string, date: string, handle?: string, lang?: string,
 *   avatar?: string, verified?: boolean | string, replyto?: string, likes?: number | string,
 *   replies?: number | string, caption?: string, captionurl?: string }} input
 */
export function normalizeXPost(input) {
  const { url, handle: urlHandle, id } = canonicalStatusUrl(input.url);
  const author = String(input.author ?? '').trim();
  if (!author) throw new XPostError(`"author" is required (the display name on ${url})`);
  const handle = String(input.handle ?? urlHandle).trim().replace(/^@/, '');
  if (!HANDLE.test(handle)) throw new XPostError(`"handle" must be an X username, found "${input.handle}"`);
  const { date, hasTime } = parseDate(input.date);
  const lang = String(input.lang ?? 'en').trim();
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(lang)) throw new XPostError(`"lang" must be a language tag like en, found "${lang}"`);
  const text = String(input.text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!text) throw new XPostError(`the post text is required for ${url}`);
  const avatar = input.avatar ? String(input.avatar).trim() : undefined;
  if (avatar && !LOCAL_AVATAR.test(avatar)) {
    throw new XPostError(`"avatar" must be a self-hosted image path like /x-avatars/name.webp, found "${avatar}"`);
  }
  const replyTo = input.replyto ? String(input.replyto).trim().replace(/^@/, '') : undefined;
  if (replyTo && !HANDLE.test(replyTo)) throw new XPostError(`"replyto" must be an X username, found "${input.replyto}"`);
  const caption = input.caption ? String(input.caption).trim() : undefined;
  const captionUrl = input.captionurl ? canonicalStatusUrl(input.captionurl).url : url;
  for (const [name, value] of [['text', text], ['author', author], ['caption', caption ?? '']]) {
    if (value.includes(EM_DASH)) {
      throw new XPostError(`the ${name} for ${url} contains an em dash, which the site never publishes (CONTEXT.md, Punctuation). Decide on a replacement with Kaleb.`);
    }
  }
  return {
    url, id, author, handle, date, hasTime, lang, text, avatar, replyTo, caption, captionUrl,
    verified: parseBoolean('verified', input.verified),
    // Counts are a snapshot that goes stale, so they only show when given.
    likes: parseCount('likes', input.likes),
    replies: parseCount('replies', input.replies),
  };
}

const compact = (value) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

const ICONS = {
  verified: '<path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"/>',
  x: '<path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z"/>',
  heart: '<path d="M16.7 3.5c-1.85 0-3.5.95-4.7 2.6-1.2-1.65-2.85-2.6-4.7-2.6C4.3 3.5 2 5.9 2 9c0 5.6 8.5 10.9 9.6 11.5.25.15.55.15.8 0C13.5 19.9 22 14.6 22 9c0-3.1-2.3-5.5-5.3-5.5z"/>',
  reply: '<path d="M12 3C6.5 3 2 6.8 2 11.5c0 2.6 1.4 4.9 3.6 6.5L4.8 21l3.9-1.8c1 .3 2.1.4 3.3.4 5.5 0 10-3.8 10-8.5S17.5 3 12 3z"/>',
  link: '<path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.5-3.5a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0zM8.5 19.8a4.5 4.5 0 0 1-3.2-7.7l2.1-2.1 1.4 1.4-2.1 2.1a2.5 2.5 0 0 0 3.5 3.5l2.1-2.1 1.4 1.4-2.1 2.1a4.5 4.5 0 0 1-3.1 1.4zm8.1-5.4-1.4-1.4 2.1-2.1a2.5 2.5 0 0 0-3.5-3.5l-2.1 2.1-1.4-1.4 2.1-2.1a4.5 4.5 0 0 1 6.4 6.4z"/>',
};

const icon = (name, className) =>
  `<svg class="${className}" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

const external = (label) => `<span class="sr-only"> ${label}(external site)</span>`;

/**
 * Render the static, accessible card markup.
 * @param {Parameters<typeof normalizeXPost>[0]} input
 * @returns {string}
 */
export function renderXPost(input) {
  const post = normalizeXPost(input);
  const paragraphs = post.text
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${paragraph.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('');
  const shownDate = post.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const shownTime = post.hasTime
    ? `${post.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })} UTC · `
    : '';
  const datetime = post.hasTime ? post.date.toISOString().replace('.000Z', 'Z') : post.date.toISOString().slice(0, 10);
  const url = escapeHtml(post.url);
  const avatar = post.avatar
    ? `<img class="x-post-avatar" src="${escapeHtml(post.avatar)}" width="48" height="48" loading="lazy" decoding="async" alt="">`
    : `<span class="x-post-avatar x-post-initial" aria-hidden="true">${escapeHtml(Array.from(post.author)[0].toUpperCase())}</span>`;
  const badge = post.verified
    ? ` <svg class="x-post-badge" viewBox="0 0 24 24" width="18" height="18" role="img" aria-label="Verified account" focusable="false"><title>Verified account</title>${ICONS.verified}</svg>`
    : '';
  const repliesLabel = post.replies === undefined
    ? 'Read replies'
    : `Read ${compact(post.replies)} ${post.replies === 1 ? 'reply' : 'replies'}`;
  return [
    '<figure class="x-post">',
    '<div class="x-post-card">',
    '<div class="x-post-head">',
    avatar,
    `<p class="x-post-names"><span class="x-post-author">${escapeHtml(post.author)}</span>${badge} <span class="x-post-handle">@${escapeHtml(post.handle)}</span></p>`,
    icon('x', 'x-post-logo'),
    '</div>',
    post.replyTo ? `<p class="x-post-reply">Replying to <span class="x-post-reply-handle">@${escapeHtml(post.replyTo)}</span></p>` : '',
    `<blockquote class="twitter-tweet" data-dnt="true" data-conversation="none" cite="${url}" lang="${escapeHtml(post.lang)}">${paragraphs}</blockquote>`,
    `<p class="x-post-meta"><a class="x-post-link" href="${url}"><time datetime="${datetime}">${escapeHtml(shownTime + shownDate)}</time>${external('on X ')}</a></p>`,
    '<div class="x-post-actions">',
    post.likes === undefined ? '' : `<span class="x-post-likes">${icon('heart', 'x-post-icon x-post-heart')}${escapeHtml(compact(post.likes))}<span class="sr-only"> likes</span></span>`,
    `<a class="x-post-action" href="https://x.com/intent/post?in_reply_to=${post.id}">${icon('reply', 'x-post-icon x-post-reply-icon')}Reply${external('on X ')}</a>`,
    `<button class="x-post-action x-post-copy" type="button" data-x-post-copy="${url}" hidden>${icon('link', 'x-post-icon')}<span class="x-post-copy-label" aria-live="polite">Copy link</span></button>`,
    '</div>',
    `<a class="x-post-replies" href="${url}">${escapeHtml(repliesLabel)}${external('on X ')}</a>`,
    '</div>',
    post.caption ? `<figcaption><a href="${escapeHtml(post.captionUrl)}">${escapeHtml(post.caption)}</a></figcaption>` : '',
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
