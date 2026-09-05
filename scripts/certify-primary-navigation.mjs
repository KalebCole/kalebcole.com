export function hasCanonicalResumeLinkInPrimaryNavigation(html) {
  const navigation = html.match(/<nav\b[^>]*aria-label="Primary navigation"[^>]*>([\s\S]*?)<\/nav>/i)?.[1];
  if (navigation === undefined) return false;

  return [...navigation.matchAll(/<a\b[^>]*>Résumé<\/a>/gi)].some((match) => {
    const anchor = match[0];
    if (!/\bhref="\/resume\.pdf"/i.test(anchor)) return false;

    const target = anchor.match(/\btarget(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/i);
    if (!target) return true;

    return (target[1] ?? target[2] ?? target[3] ?? '').toLowerCase() === '_self';
  });
}
