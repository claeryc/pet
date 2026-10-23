// Checks the art and character data against the JSON schemas in schemas/,
// which also give editors like VS Code hints and autocomplete while you
// edit these files. A misspelt key ("shpae") or a wrong kind of value is
// caught here instead of being quietly ignored by the game.
import { describe, expect, it } from 'vitest';
import characters from '../src/data/characters.json';
import hats from '../src/data/hats.json';
import traits from '../src/data/traits.json';
import manifest from '../public/sprites/manifest.json';
import charactersSchema from '../schemas/characters.schema.json';
import hatsSchema from '../schemas/hats.schema.json';
import manifestSchema from '../schemas/manifest.schema.json';
import traitsSchema from '../schemas/traits.schema.json';

type Schema = Record<string, any>;

// Just the parts of JSON Schema these files use. Returns every problem, as
// "path: what's wrong".
function validate(value: unknown, schema: Schema, root: Schema = schema, path = ''): string[] {
  if (schema.$ref) return validate(value, root.definitions[schema.$ref.replace('#/definitions/', '')], root, path);
  if (schema.oneOf) {
    const ok = schema.oneOf.filter((s: Schema) => validate(value, s, root, path).length === 0).length;
    return ok === 1 ? [] : [`${path || '/'}: doesn't match exactly one allowed form`];
  }
  const at = path || '/';
  const kind = Array.isArray(value) ? 'array' : value === null ? 'null' : Number.isInteger(value) ? 'integer' : typeof value;
  if (schema.type && !(schema.type === kind || (schema.type === 'number' && kind === 'integer')))
    return [`${at}: should be ${schema.type}, is ${kind}`];
  const errors: string[] = [];
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: should be one of ${schema.enum.join(', ')}`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: should be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: should be at most ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(`${at}: should be more than ${schema.exclusiveMinimum}`);
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => errors.push(...validate(v, schema.items, root, `${path}/${i}`)));
  if (kind === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in obj)) errors.push(`${at}: missing "${key}"`);
    for (const [key, v] of Object.entries(obj)) {
      const sub = schema.properties?.[key] ?? schema.additionalProperties;
      if (sub === false) errors.push(`${path}/${key}: isn't a known key`);
      else if (sub && sub !== true) errors.push(...validate(v, sub, root, `${path}/${key}`));
    }
  }
  return errors;
}

describe('data files match their schemas', () => {
  it.each([
    ['public/sprites/manifest.json', manifest, manifestSchema],
    ['src/data/characters.json', characters, charactersSchema],
    ['src/data/hats.json', hats, hatsSchema],
    ['src/data/traits.json', traits, traitsSchema],
  ])('%s', (_, data, schema) => {
    expect(validate(data, schema)).toEqual([]);
  });
});

describe('the schema check', () => {
  it('catches a misspelt key, a wrong kind of value and a missing key', () => {
    const bad = { ...manifest, sheets: { sprig: { file: 'a.png', shpae: 'blob', idleSet: 3 }, hat: { head: { x: 1, y: 2 } } } };
    expect(validate(bad, manifestSchema)).toEqual([
      "/sheets/sprig/shpae: isn't a known key",
      "/sheets/sprig/idleSet: doesn't match exactly one allowed form",
      '/sheets/hat/head: missing "width"',
    ]);
  });
});
