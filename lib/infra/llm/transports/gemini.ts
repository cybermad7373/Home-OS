import { schemaInstruction } from "../schema";
import type { JsonSchema, Transport } from "../types";
import { truncateError } from "./openai-chat";

/**
 * `POST {baseUrl}/models/{model}:generateContent` — docs/10-LLM-SPEC.md
 * section 2.1. Google AI Studio.
 *
 * The key travels as the `x-goog-api-key` header rather than in the query
 * string, so it does not end up in a proxy log or a browser history.
 */
export const geminiTransport: Transport = async (config, req, signal) => {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: [{ text: req.user }] }],
    generationConfig: {
      temperature: req.temperature,
      maxOutputTokens: req.maxTokens,
      responseMimeType: "application/json",
    },
  };

  const generationConfig = body.generationConfig as Record<string, unknown>;
  if (config.jsonMode === "schema") {
    generationConfig.responseSchema = toGeminiSchema(req.schema);
  } else if (config.jsonMode === "prompt") {
    body.systemInstruction = {
      parts: [{ text: `${req.system}\n\n${schemaInstruction(req.schema)}` }],
    };
  }

  let response: Response;
  try {
    response = await fetch(
      `${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body: JSON.stringify(body),
        signal,
      },
    );
  } catch (error) {
    return { status: 0, error: (error as Error).message };
  }

  const raw = await response.text();
  if (!response.ok) return { status: response.status, error: truncateError(raw) };

  try {
    const parsed = JSON.parse(raw) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = parsed.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("");

    if (!text) return { status: response.status, error: "no candidate text in the response" };

    return {
      status: response.status,
      text,
      usage: {
        promptTokens: parsed.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: parsed.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  } catch {
    return { status: response.status, error: "the response was not JSON" };
  }
};

/**
 * Gemini's `responseSchema` is OpenAPI-shaped rather than JSON Schema:
 * uppercase types, and it rejects the vocabulary it does not know —
 * `additionalProperties` among it — with a 400 rather than ignoring it.
 */
export function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (schema.enum) {
    out.type = "STRING";
    out.enum = schema.enum.map(String);
    return out;
  }

  switch (schema.type) {
    case "object": {
      out.type = "OBJECT";
      if (schema.properties) {
        out.properties = Object.fromEntries(
          Object.entries(schema.properties).map(([key, child]) => [key, toGeminiSchema(child)]),
        );
      }
      if (schema.required?.length) out.required = schema.required;
      return out;
    }
    case "array": {
      out.type = "ARRAY";
      if (schema.items) out.items = toGeminiSchema(schema.items);
      return out;
    }
    case "integer":
      out.type = "INTEGER";
      return out;
    case "number":
      out.type = "NUMBER";
      return out;
    case "boolean":
      out.type = "BOOLEAN";
      return out;
    default:
      out.type = "STRING";
      return out;
  }
};
