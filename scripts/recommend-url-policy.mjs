// Single source of truth: the contract schema's x-disallowedQueryParameters list.
// A static JSON import works in plain Node and in Astro's Vite build, with no runtime file reads.
import contractSchema from "../automations/recommends-capture/contract.schema.json" with { type: "json" };

const policy = contractSchema["x-disallowedQueryParameters"];

const disallowedNames = new Set(policy.names.map((name) => name.toLowerCase()));
const disallowedPrefixes = policy.prefixes.map((prefix) => prefix.toLowerCase());

// Decode a raw query parameter name exactly as URLSearchParams does, for comparison only.
// rawName never contains "&", "=", or "#". The leading "&" stops URLSearchParams from
// stripping a leading "?" from the name, so "??si=1" is read as the name "?si", as browsers do.
function decodeParameterName(rawName) {
  const names = [...new URLSearchParams(`&${rawName}=`).keys()];
  return names.length > 0 ? names[names.length - 1] : "";
}

/**
 * A parameter is disallowed when its decoded, lowercased name exactly equals a listed
 * name or starts with a listed prefix. "sig2" and "utmost" are therefore allowed.
 */
export function isDisallowedQueryParameter(rawName) {
  const name = decodeParameterName(rawName).toLowerCase();
  return disallowedNames.has(name) || disallowedPrefixes.some((prefix) => name.startsWith(prefix));
}

// Split a URL string into [beforeQuery, query or null, fragment including "#" or ""] without re-encoding.
function splitUrl(url) {
  const hashIndex = url.indexOf("#");
  const fragment = hashIndex === -1 ? "" : url.slice(hashIndex);
  const beforeFragment = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = beforeFragment.indexOf("?");
  if (queryIndex === -1) {
    return [beforeFragment, null, fragment];
  }
  return [beforeFragment.slice(0, queryIndex), beforeFragment.slice(queryIndex + 1), fragment];
}

function parameterName(segment) {
  const equalsIndex = segment.indexOf("=");
  return equalsIndex === -1 ? segment : segment.slice(0, equalsIndex);
}

/** Raw names of disallowed query parameters in a URL, in order, without duplicates. */
export function disallowedQueryParametersIn(url) {
  const [, query] = splitUrl(url);
  if (query === null) {
    return [];
  }
  const names = query.split("&").map(parameterName).filter(isDisallowedQueryParameter);
  return [...new Set(names)];
}

/**
 * Remove every disallowed query parameter. Other parameters keep their order and bytes,
 * an empty "?" is dropped, and everything else in the URL is returned unchanged.
 */
export function normalizeRecommendUrl(url) {
  const [beforeQuery, query, fragment] = splitUrl(url);
  if (query === null) {
    return url;
  }
  const kept = query
    .split("&")
    .filter((segment) => !isDisallowedQueryParameter(parameterName(segment)))
    .join("&");
  return kept === "" ? `${beforeQuery}${fragment}` : `${beforeQuery}?${kept}${fragment}`;
}
