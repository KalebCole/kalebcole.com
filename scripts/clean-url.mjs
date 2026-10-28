import { normalizeRecommendUrl } from "./recommend-url-policy.mjs";

const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error("Usage: node scripts/clean-url.mjs <url>");
  process.exitCode = 1;
} else {
  console.log(normalizeRecommendUrl(args[0]));
}
