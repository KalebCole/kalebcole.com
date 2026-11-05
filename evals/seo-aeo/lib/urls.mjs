// URL matching against entries like "kalebcole.com" or "github.com/KalebCole":
// the host must match exactly (a www. prefix is ignored) and the path, when
// given, must match whole segments, case-insensitively.

export function urlMatches(url, entry) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const [host, ...pathParts] = entry.toLowerCase().split('/');
  if (parsed.hostname.toLowerCase().replace(/^www\./, '') !== host) return false;
  const path = pathParts.filter(Boolean).join('/');
  if (!path) return true;
  const actual = parsed.pathname.toLowerCase().replace(/^\/+/, '');
  return actual === path || actual.startsWith(`${path}/`);
}

export const urlMatchesAny = (url, entries) => entries.some((entry) => urlMatches(url, entry));
