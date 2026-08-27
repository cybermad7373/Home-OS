import type { Transport } from "../types";
import { truncateError } from "./openai-chat";

const ANTHROPIC_VERSION = "2023-06-01";

/**
 * `POST {baseUrl}/v1/messages` — docs/10-LLM-SPEC.md section 2.1.
 *
 * There is no JSON mode here. The schema is forced through a single tool
 * definition and the model is told to use it, which is the documented way to
 * get a shape rather than a paragraph. The tool result is the answer; nothing
 * is executed.
 */
export const anthropicTransport: Transport = async (config, req, signal) => {
  const tool = {
    name: "record",
    description: "Return the answer in this exact shape.",
    input_schema: {
      type: "object",
      ...(req.schema.properties ? { properties: req.schema.properties } : {}),
      ...(req.schema.required ? { required: req.schema.required } : {}),
    },
  };

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
        system: req.system,
        tools: [tool],
        tool_choice: { type: "tool", name: "record" },
        messages: [{ role: "user", content: req.user }],
      }),
      signal,
    });
  } catch (error) {
    return { status: 0, error: (error as Error).message };
  }

  const raw = await response.text();
  if (!response.ok) return { status: response.status, error: truncateError(raw) };

  try {
    const parsed = JSON.parse(raw) as {
      content?: { type?: string; text?: string; input?: unknown }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const toolUse = parsed.content?.find((block) => block.type === "tool_use");
    const text =
      toolUse && toolUse.input !== undefined
        ? JSON.stringify(toolUse.input)
        : parsed.content?.find((block) => block.type === "text")?.text;

    if (typeof text !== "string") {
      return { status: response.status, error: "no tool result in the response" };
    }

    return {
      status: response.status,
      text,
      usage: {
        promptTokens: parsed.usage?.input_tokens ?? 0,
        completionTokens: parsed.usage?.output_tokens ?? 0,
      },
    };
  } catch {
    return { status: response.status, error: "the response was not JSON" };
  }
};
