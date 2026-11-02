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
 *
 * dateModified is the frontmatter `updated` date when the post has one, and
 * the publication date otherwise. It never comes from git history, so a
 * shallow deploy clone or a typo-fix commit cannot change it.
 *
 * image is the post's share image (the same absolute URL as its og:image), so
 * structured data and link previews always agree.
 * @param {{ title: string, description: string, url: string | URL, date: Date, updated?: Date, image: { url: string | URL, width: number, height: number } }} post
 */
export function blogPostingSchema({ title, description, url, date, updated, image }) {
  const href = String(url);
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    url: href,
    mainEntityOfPage: href,
    image: {
      '@type': 'ImageObject',
      url: String(image.url),
      width: image.width,
      height: image.height,
    },
    datePublished: isoDate(date),
    dateModified: isoDate(updated ?? date),
    author: PERSON_AUTHOR,
  };
}
