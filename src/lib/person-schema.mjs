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

/** @type {Record<string, unknown>} */
export const PERSON_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Person',
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
  sameAs: [...profileUrls, 'https://x.com/Kalebicole'],
};
