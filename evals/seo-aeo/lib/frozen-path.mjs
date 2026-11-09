// The frozen visibility-only question keeps one historical em dash so its
// sha256 stays stable. Punctuation skips this path only. Scoring policy
// lives in strict-visibility.mjs, not here.
export const FROZEN_EMDASH_EXCEPTION = 'evals/seo-aeo/questions/questions.visibility-only.v1.frozen.json';

// Pinned supplement captures. Their bytes, including punctuation, are the request
// input. Editing them would present a different request as that capture.
export const SUPPLEMENT_CAPTURE_PATHS = [
  'evals/seo-aeo/visibility-choice-v1/supplement-inputs/fresh-google-signed-out-who-is.txt',
  'evals/seo-aeo/visibility-choice-v1/supplement-inputs/fresh-google-signed-out-name.txt',
];
