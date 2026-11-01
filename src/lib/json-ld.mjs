import { PERSON_AUTHOR } from './person-schema.mjs';

/**
 * Serializes a JSON-LD object for an inline script. Escaping `<` keeps a title
 * or description containing `</script>` from closing the element early.
 * @param {Record<string, unknown>} data
 */
export function serializeJsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** @param {Date} date */
const isoDate = (date) => date.toISOString().slice(0, 10);

/**
 * BlogPosting structured data for one published piece of writing. Dates are
 * calendar dates because frontmatter dates carry no time of day.
 * @param {{ title: string, description: string, url: string | URL, date: Date, updated?: Date }} post
 */
export function blogPostingSchema({ title, description, url, date, updated }) {
  const href = String(url);
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    url: href,
    mainEntityOfPage: href,
    datePublished: isoDate(date),
    ...(updated ? { dateModified: isoDate(updated) } : {}),
    author: PERSON_AUTHOR,
  };
}
