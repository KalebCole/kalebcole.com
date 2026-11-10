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

/**
 * Kaleb approved this wording verbatim on 2026-11-01 for /llms.txt. It is
 * also the Person JSON-LD description so structured data and llms.txt match.
 * Protected: do not edit, reflow, or rephrase it without his explicit ok.
 */
export const PERSON_DESCRIPTION = "Kaleb Cole is a software engineer at Microsoft in Seattle. He builds Azure's support ticket platform, where customers open tickets on their Azure resources and engineers triage and fix them, with a focus on scaling it and keeping it consistent across Azure's sovereign clouds. On his site he writes about AI agents and the things he builds with them.";

/** @type {Record<string, unknown>} */
export const PERSON_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  '@id': PERSON_ID,
  name: 'Kaleb Cole',
  url: 'https://kalebcole.com/',
  image: 'https://kalebcole.com/me.jpg',
  description: PERSON_DESCRIPTION,
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
