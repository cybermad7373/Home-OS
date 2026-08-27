import { schemaInstruction } from "../schema";
import type { Transport, TransportResult } from "../types";

/**
 * `POST {baseUrl}/chat/completions` with a bearer key — docs/10-LLM-SPEC.md
 * section 2.1.
 *
 * Groq, OpenRouter, Together, Cerebras, Mistral, DeepSeek, the Hugging Face
 * router, OpenAI, and Ollama or LM Studio on localhost all speak this. Which is
 * why one file covers seven of the nine shipped providers.
 */
export const openAiChatTransport: Transport = async (config, req, signal) => {
  const system =
    config.jsonMode === "prompt" ? `${req.system}\n\n${schemaInstruction(req.schema)}` : req.system;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // A local Ollama or LM Studio server usually wants no key at all, and sending
  // `Bearer ` with nothing after it is rejected by some of them.
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const body: Record<string, unknown> = {
    model: config.model,
    temperature: req.temperature,
    max_tokens: req.maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: req.user },
    ],
  };

  if (config.jsonMode === "native" || config.jsonMode === "schema") {
    body.response_format = { type: "json_object" };
  }

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    return { status: 0, error: (error as Error).message };
  }

  return readOpenAiResponse(response);
};

export async function readOpenAiResponse(response: Response): Promise<TransportResult> {
  const raw = await response.text();

  if (!response.ok) {
    return { status: response.status, error: truncateError(raw) };
  }

  try {
    const parsed = JSON.parse(raw) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = parsed.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      return { status: response.status, error: "no message content in the response" };
    }
    return {
      status: response.status,
      text,
      usage: {
        promptTokens: parsed.usage?.prompt_tokens ?? 0,
        completionTokens: parsed.usage?.completion_tokens ?? 0,
      },
    };
  } catch {
    return { status: response.status, error: "the response was not JSON" };
  }
}

/**
 * A provider error body can be several kilobytes of HTML from a proxy. What is
 * useful is the first line, and what is stored is `llm_runs.error`.
 */
export function truncateError(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return collapsed.length > 300 ? `${collapsed.slice(0, 299)}…` : collapsed;
}
