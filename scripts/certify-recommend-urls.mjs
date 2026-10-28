import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { disallowedQueryParametersIn, normalizeRecommendUrl } from "./recommend-url-policy.mjs";

const URL_FIELDS = ["url", "image"];

function frontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  return match ? match[1] : "";
}

function scalar(raw) {
  const value = raw.trim();
  if (value.startsWith('"')) {
    return JSON.parse(value);
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value.replace(/\s+#.*$/, "");
}

/** Every recommend URL field, published or draft, whose value is not already normalized. */
export function findRecommendUrlViolations(directory) {
  const violations = [];
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".md")).sort()) {
    const block = frontmatter(readFileSync(join(directory, file), "utf8"));
    for (const field of URL_FIELDS) {
      const line = new RegExp(`^${field}:(.*)$`, "m").exec(block);
      if (!line) {
        continue;
      }
      const value = scalar(line[1]);
      if (normalizeRecommendUrl(value) !== value) {
        violations.push({ file, field, value, parameters: disallowedQueryParametersIn(value) });
      }
    }
  }
  return violations;
}

function main() {
  const directory = process.argv[2]
    ?? fileURLToPath(new URL("../src/content/recommends", import.meta.url));
  const violations = findRecommendUrlViolations(directory);
  if (violations.length > 0) {
    for (const { file, field, parameters } of violations) {
      const problem = parameters.length > 0
        ? `tracking, share, or credential query parameters: ${parameters.join(", ")}`
        : "an empty query string";
      console.error(`${file}: ${field} has ${problem}. Run node scripts/clean-url.mjs on it.`);
    }
    process.exitCode = 1;
    return;
  }
  console.log("Certified recommend URLs contain no tracking, share, or credential query parameters.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
