import { z } from 'astro/zod';
import { disallowedQueryParametersIn, normalizeRecommendUrl } from '../../scripts/recommend-url-policy.mjs';

/**
 * Problems that keep a recommend URL out of published content, or [] when it is publishable.
 * The URL must already be normalized (no tracking, share, or credential query parameters and
 * no empty query string) and must not carry userinfo (user:password@). Fragments are allowed.
 */
export function recommendUrlProblems(value) {
  const problems = [];
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return ['is not an absolute URL'];
  }
  if (parsed.username !== '' || parsed.password !== '') {
    problems.push('must not include userinfo (user:password@)');
  }
  if (normalizeRecommendUrl(value) !== value) {
    const parameters = disallowedQueryParametersIn(value);
    problems.push(
      parameters.length > 0
        ? `must not include tracking, share, or credential query parameters: ${parameters.join(', ')}. Use ${normalizeRecommendUrl(value)} (node scripts/clean-url.mjs <url>)`
        : `must not end with an empty query string. Use ${normalizeRecommendUrl(value)}`,
    );
  }
  return problems;
}

/** Zod schema for the recommends collection's url and image fields. */
export const recommendUrl = z
  .string()
  .url()
  .superRefine((value, context) => {
    for (const message of recommendUrlProblems(value)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `${value} ${message}` });
    }
  });
