import { z } from 'astro/zod';
import { disallowedQueryParametersIn, normalizeRecommendUrl } from '../../scripts/recommend-url-policy.mjs';

// C0 controls, space, and DEL. WHATWG URL parsing silently drops or trims some of these,
// so a URL containing them can read differently in a browser than it does here.
const CONTROL_OR_SPACE = /[\u0000-\u0020\u007f]/;

/**
 * Problems that keep a recommend URL out of published content, or [] when it is publishable.
 * A publishable URL is an http(s) URL already in canonical WHATWG form (new URL(u).href === u),
 * with no spaces or control characters, no userinfo, no empty query string, and none of the
 * tracking, share, or credential query parameters in contract.schema.json. Fragments are allowed.
 *
 * Messages never repeat the original URL, because its query values may hold credentials.
 * They name offending parameters only, and suggest a cleaned URL built from the canonical
 * href with userinfo and every disallowed parameter removed.
 */
export function recommendUrlProblems(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return ['must be an absolute http or https URL'];
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return [`must use http or https, not ${parsed.protocol}`];
  }

  const problems = [];
  if (CONTROL_OR_SPACE.test(value)) {
    problems.push('must not contain spaces, tabs, line breaks, or other control characters');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    problems.push('must not include userinfo (user:password@)');
  }
  // Check parameters on the canonical href, which is how a browser will read them.
  const parameters = disallowedQueryParametersIn(parsed.href);
  if (parameters.length > 0) {
    problems.push(`must not include tracking, share, or credential query parameters: ${parameters.join(', ')}`);
  }
  if (problems.length === 0 && normalizeRecommendUrl(value) !== value) {
    problems.push('must not end with an empty query string');
  }
  if (problems.length === 0 && parsed.href !== value) {
    problems.push('must be in canonical URL form');
  }
  if (problems.length === 0) {
    return [];
  }

  parsed.username = '';
  parsed.password = '';
  const suggestion = normalizeRecommendUrl(parsed.href);
  return [`${problems.join('; ')}. Use ${suggestion}`];
}

/** Zod schema for the recommends collection's url and image fields. */
export const recommendUrl = z.string().superRefine((value, context) => {
  for (const message of recommendUrlProblems(value)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message });
  }
});
