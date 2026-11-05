// A small JSON Schema validator for the subset the eval schemas use: type,
// enum, const, required, properties, additionalProperties, items, minItems,
// uniqueItems, minLength, pattern, minimum, maximum, format (date, date-time,
// uri) and local $ref. It keeps the eval free of new dependencies.

const FORMATS = {
  date: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
  'date-time': (value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value)),
  uri: (value) => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  },
};

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function typeMatches(expected, value) {
  const actual = typeOf(value);
  return expected === actual || (expected === 'number' && actual === 'integer');
}

function resolve(root, ref) {
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref ${ref}`);
  return ref.slice(2).split('/').reduce((node, key) => node?.[key], root);
}

function walk(schema, value, path, root, errors) {
  if (schema.$ref) return walk(resolve(root, schema.$ref), value, path, root, errors);
  const where = path || '(root)';

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(type, value))) {
      errors.push(`${where}: expected ${types.join(' or ')}, got ${typeOf(value)}`);
      return;
    }
  }
  if (schema.enum && !schema.enum.some((option) => option === value)) {
    errors.push(`${where}: must be one of ${schema.enum.map((option) => JSON.stringify(option)).join(', ')}`);
  }
  if ('const' in schema && schema.const !== value) errors.push(`${where}: must be ${JSON.stringify(schema.const)}`);

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${where}: is shorter than ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${where}: does not match ${schema.pattern}`);
    if (schema.format && FORMATS[schema.format] && !FORMATS[schema.format](value)) errors.push(`${where}: is not a valid ${schema.format}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${where}: is below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${where}: is above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${where}: needs at least ${schema.minItems} item(s)`);
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${where}: items must be unique`);
    if (schema.items) value.forEach((item, index) => walk(schema.items, item, `${path}[${index}]`, root, errors));
  }
  if (typeOf(value) === 'object') {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${where}: missing required ${key}`);
    }
    const properties = schema.properties ?? {};
    for (const [key, item] of Object.entries(value)) {
      const child = path ? `${path}.${key}` : key;
      if (properties[key]) walk(properties[key], item, child, root, errors);
      else if (schema.additionalProperties === false) errors.push(`${where}: unexpected property ${key}`);
      else if (typeof schema.additionalProperties === 'object') walk(schema.additionalProperties, item, child, root, errors);
    }
  }
}

/** Returns a list of readable errors; empty means valid. */
export function validate(schema, value) {
  const errors = [];
  walk(schema, value, '', schema, errors);
  return errors;
}
