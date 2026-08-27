import type { JsonSchema } from "./types";

/**
 * JSON extraction and schema validation — docs/10-LLM-SPEC.md section 1,
 * the "structured output" and "validation" guarantees.
 *
 * A provider that supports JSON mode still returns a string, and a provider
 * that does not returns prose with a JSON block somewhere inside it. Both end
 * up here, and a response that does not match the declared schema is
 * `ok: false` rather than a partially-trusted object.
 */

/**
 * The first balanced `{…}` or `[…]` block in a string.
 *
 * Braces inside string literals do not count, which is the whole reason this is
 * not a regular expression: a chore called "Clean {the} bathroom" would end the
 * object three characters early.
 */
export function extractJson(text: string): string | null {
  const opener = text.search(/[{[]/);
  if (opener < 0) return null;

  const open = text[opener];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = opener; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(opener, i + 1);
    }
  }

  return null;
}

export function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const block = extractJson(text);
  if (block === null) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(block) };
  } catch {
    return { ok: false };
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Every failure, not just the first — the same reason the constraint checker does. */
export function validateAgainstSchema(
  value: unknown,
  schema: JsonSchema,
  path = "$",
): string[] {
  const errors: string[] = [];
  const fail = (message: string) => errors.push(`${path}: ${message}`);

  if (schema.enum) {
    if (!schema.enum.includes(value as string | number)) {
      fail(`not one of ${schema.enum.join(", ")}`);
      return errors;
    }
  }

  switch (schema.type) {
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        fail("expected an object");
        return errors;
      }
      const record = value as Record<string, unknown>;

      for (const key of schema.required ?? []) {
        if (!(key in record)) fail(`missing ${key}`);
      }

      if (schema.additionalProperties === false && schema.properties) {
        for (const key of Object.keys(record)) {
          if (!(key in schema.properties)) fail(`unexpected property ${key}`);
        }
      }

      for (const [key, child] of Object.entries(schema.properties ?? {})) {
        if (record[key] === undefined) continue;
        errors.push(...validateAgainstSchema(record[key], child, `${path}.${key}`));
      }
      return errors;
    }

    case "array": {
      if (!Array.isArray(value)) {
        fail("expected an array");
        return errors;
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        fail(`more than ${schema.maxItems} items`);
      }
      if (schema.items) {
        value.forEach((item, index) => {
          errors.push(...validateAgainstSchema(item, schema.items!, `${path}[${index}]`));
        });
      }
      return errors;
    }

    case "string": {
      if (typeof value !== "string") {
        fail("expected a string");
        return errors;
      }
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        fail(`shorter than ${schema.minLength}`);
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        fail(`longer than ${schema.maxLength}`);
      }
      if (schema.format === "date" && !ISO_DATE.test(value)) {
        fail("not an ISO date");
      }
      return errors;
    }

    case "integer":
    case "number": {
      if (typeof value !== "number" || Number.isNaN(value)) {
        fail("expected a number");
        return errors;
      }
      if (schema.type === "integer" && !Number.isInteger(value)) {
        fail("expected an integer");
      }
      if (schema.minimum !== undefined && value < schema.minimum) {
        fail(`below ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        fail(`above ${schema.maximum}`);
      }
      return errors;
    }

    case "boolean": {
      if (typeof value !== "boolean") fail("expected a boolean");
      return errors;
    }

    default:
      // No declared type — an `enum`-only node, already handled above.
      return errors;
  }
}

/**
 * The schema, as a sentence to append to a prompt.
 *
 * Used by the `prompt` JSON mode, where the provider has no structured-output
 * flag and the only lever available is telling the model what shape to answer
 * in.
 */
export function schemaInstruction(schema: JsonSchema): string {
  return [
    "Return only JSON. No prose, no code fences, no explanation.",
    "It must match this JSON Schema exactly:",
    JSON.stringify(schema),
  ].join("\n");
}
