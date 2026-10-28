import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateCaptureRequest } from "../scripts/validate-recommends-capture.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const validator = path.join(repositoryRoot, "scripts", "validate-recommends-capture.mjs");

function validRequest(overrides = {}) {
  return {
    title: "Fictional validation candidate",
    url: "https://example.com/articles/fictional",
    date: "2026-01-01",
    medium: "read",
    draft: true,
    ...overrides,
  };
}

function validate(request) {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "recommends-capture-validation-"));
  const requestPath = path.join(temporaryDirectory, "request.json");

  try {
    writeFileSync(requestPath, JSON.stringify(request), "utf8");
    return execFileSync(process.execPath, [validator, requestPath], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function validationError(request) {
  assert.throws(
    () => validate(request),
    (error) => error.status === 1 && /Invalid recommends capture request:/.test(error.stderr),
  );
}

test("accepts the public dry-run fixture", () => {
  const output = execFileSync(
    process.execPath,
    [validator, "automations/recommends-capture/dry-run.fixture.json"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );

  assert.match(output, /recommends capture request is valid/);
});

test("rejects public URLs with credentials, fragments, or non-canonical form", () => {
  validationError(validRequest({ url: "https://user:password@example.com/articles/fictional" }));
  validationError(validRequest({ url: "https://EXAMPLE.com/articles/fictional" }));
  validationError(validRequest({ url: "https://example.com/articles/fictional#section" }));
  validationError(validRequest({ url: "https://example.com/articles/fictional?" }));
});

test("accepts content-identifying query parameters", () => {
  validate(validRequest({ url: "https://www.youtube.com/watch?v=IroPQ150F6c", medium: "watch" }));
  validate(validRequest({ url: "https://www.youtube.com/watch?v=IroPQ150F6c&t=90", medium: "watch" }));
  validate(validRequest({ url: "https://open.spotify.com/episode/5hjExzCXyI72n9uCaC8fyD", medium: "listen" }));
  validate(validRequest({ image: "https://example.com/image.png?w=1200" }));
  validate(validRequest({ url: "https://example.com/articles/fictional?key=abc&ref=v1.2&session=keynote-2026&share=1" }));
  validate(validRequest({ url: "https://example.com/sale?expires=2026-12-01" }));
});

test("rejects tracking, share, and credential query parameters", () => {
  validationError(validRequest({ url: "https://example.com/articles/fictional?_ga=GA1.2.3" }));
  validationError(validRequest({ url: "https://example.com/articles/fictional?X-Amz-Signature=abc" }));
  validationError(validRequest({ url: "https://example.com/articles/fictional?utm_source=newsletter" }));
  validationError(validRequest({ url: "https://example.com/articles/fictional?UTM_Campaign=launch" }));
  validationError(validRequest({ url: "https://www.youtube.com/watch?v=IroPQ150F6c&si=abc123", medium: "watch" }));
  validationError(validRequest({
    url: "https://open.spotify.com/episode/5hjExzCXyI72n9uCaC8fyD?si=oSsrvt5HS6qEaS294N-bXQ&utm_source=copy-link",
    medium: "listen",
  }));
  validationError(validRequest({ image: "https://example.com/image.png?token=private" }));
});

test("rejects non-draft payloads and unknown fields", () => {
  validationError(validRequest({ draft: false }));
  validationError(validRequest({ unexpected: "not part of the public contract" }));
});

test("rejects invalid media and malformed calendar dates", () => {
  validationError(validRequest({ medium: "stream" }));
  validationError(validRequest({ date: "2026-02-30" }));
  validationError(validRequest({ date: "2026-1-01" }));
});

test("preserves a supplied take byte-for-byte", () => {
  const take = "I liked the precise, unpolished phrasing.\nSecond line stays put.\t✓";
  const request = validRequest({ take });
  const validatedRequest = validateCaptureRequest(request);

  assert.strictEqual(validatedRequest, request);
  assert.equal(validatedRequest.take, take);
});

test("leaves an absent take absent", () => {
  const request = validRequest();
  const validatedRequest = validateCaptureRequest(request);

  assert.strictEqual(validatedRequest, request);
  assert.equal(Object.hasOwn(validatedRequest, "take"), false);
});
