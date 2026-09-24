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

test("rejects public URLs with credentials or query parameters", () => {
  validationError(validRequest({ url: "https://user:password@example.com/articles/fictional" }));
  validationError(validRequest({ url: "https://example.com/articles/fictional?ref=private" }));
  validationError(validRequest({ url: "https://EXAMPLE.com/articles/fictional" }));
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
