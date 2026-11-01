import { ELSEWHERE_LINKS } from './elsewhere.mjs';

/**
 * JSON-LD Person entity for Kaleb Cole, rendered on the homepage so search
 * engines can distinguish the site owner from other people sharing the name.
 * Profile URLs come from the shared elsewhere source; the mailto link is
 * excluded because sameAs expects public profile pages.
 */
const profileUrls = ELSEWHERE_LINKS.map((link) => link.href).filter((href) =>
  href.startsWith('https://'),
);

/**
 * Stable node id for the site owner. The homepage Person carries it, and every
 * BlogPosting author repeats it so search engines join them into one entity.
 */
export const PERSON_ID = 'https://kalebcole.com/#person';

/** @type {Record<string, unknown>} */
export const PERSON_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  '@id': PERSON_ID,
  name: 'Kaleb Cole',
  url: 'https://kalebcole.com/',
  image: 'https://kalebcole.com/me.jpg',
  jobTitle: 'Software Engineer',
  worksFor: {
    '@type': 'Organization',
    name: 'Microsoft',
  },
  homeLocation: {
    '@type': 'Place',
    name: 'Seattle, WA',
  },
  sameAs: profileUrls,
};

/**
 * The compact Person used as the author of each piece of writing. It reuses
 * the homepage entity's id, name, url, and sameAs instead of keeping a copy.
 */
export const PERSON_AUTHOR = {
  '@type': 'Person',
  '@id': PERSON_ID,
  name: PERSON_SCHEMA.name,
  url: PERSON_SCHEMA.url,
  sameAs: profileUrls,
};
