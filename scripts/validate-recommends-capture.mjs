import { readFileSync } from "node:fs";

const schemaPath = new URL("../automations/recommends-capture/contract.schema.json", import.meta.url);
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function isValidUri(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isPublicCanonicalUrl(value) {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:")
      && parsed.username === ""
      && parsed.password === ""
      && parsed.search === ""
      && parsed.hash === ""
      && parsed.href === value;
  } catch {
    return false;
  }
}

function addError(errors, path, message) {
  errors.push(`${path} ${message}`);
}

function validateValue(value, valueSchema, path, errors) {
  if (valueSchema.const !== undefined && value !== valueSchema.const) {
    addError(errors, path, `must equal ${JSON.stringify(valueSchema.const)}`);
    return;
  }

  if (valueSchema.enum && !valueSchema.enum.includes(value)) {
    addError(errors, path, `must be one of ${valueSchema.enum.map((item) => JSON.stringify(item)).join(", ")}`);
    return;
  }

  if (valueSchema.type === "object") {
    if (!isPlainObject(value)) {
      addError(errors, path, "must be an object");
      return;
    }

    for (const property of valueSchema.required ?? []) {
      if (!Object.hasOwn(value, property)) {
        addError(errors, path, `must include required property ${JSON.stringify(property)}`);
      }
    }

    for (const [property, propertyValue] of Object.entries(value)) {
      const propertySchema = valueSchema.properties?.[property];
      if (!propertySchema) {
        if (valueSchema.additionalProperties === false) {
          addError(errors, path, `must not include unknown property ${JSON.stringify(property)}`);
        }
        continue;
      }
      validateValue(propertyValue, propertySchema, `${path}.${property}`, errors);
    }
    return;
  }

  if (valueSchema.type === "array") {
    if (!Array.isArray(value)) {
      addError(errors, path, "must be an array");
      return;
    }

    if (valueSchema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      addError(errors, path, "must not contain duplicate items");
    }

    for (const [index, item] of value.entries()) {
      validateValue(item, valueSchema.items, `${path}[${index}]`, errors);
    }
    return;
  }

  if (valueSchema.type === "string") {
    if (typeof value !== "string") {
      addError(errors, path, "must be a string");
      return;
    }

    if (valueSchema.minLength !== undefined && value.length < valueSchema.minLength) {
      addError(errors, path, `must contain at least ${valueSchema.minLength} character${valueSchema.minLength === 1 ? "" : "s"}`);
    }

    if (valueSchema.pattern && !new RegExp(valueSchema.pattern).test(value)) {
      addError(errors, path, `must match ${valueSchema.pattern}`);
    }

    if (valueSchema.format === "uri" && !isValidUri(value)) {
      addError(errors, path, "must be an absolute URI");
    }

    if (valueSchema["x-publicCanonicalUrl"] && !isPublicCanonicalUrl(value)) {
      addError(errors, path, "must be a canonical public HTTP(S) URL without credentials, query parameters, or fragments");
    }

    if (valueSchema.format === "date" && !isValidCalendarDate(value)) {
      addError(errors, path, "must be a valid ISO 8601 calendar date");
    }
  }
}

export function validateCaptureRequest(request) {
  const errors = [];
  validateValue(request, schema, "request", errors);

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return request;
}

function main() {
  const [requestPath] = process.argv.slice(2);
  if (!requestPath || process.argv.length !== 3) {
    throw new Error("Usage: node scripts/validate-recommends-capture.mjs <request.json>");
  }

  const request = JSON.parse(readFileSync(requestPath, "utf8"));
  validateCaptureRequest(request);
  console.log("recommends capture request is valid");
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(`Invalid recommends capture request: ${error.message}`);
    process.exitCode = 1;
  }
}
