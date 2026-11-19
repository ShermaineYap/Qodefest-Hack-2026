// Qwen through Model Studio's OpenAI-compatible API with tool calling.
// The key is read from the environment and never leaves the server.

import { ToolFailure } from "./tools/expandUrl.ts";

export interface QwenTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface QwenMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export const EXPAND_URL_TOOL: QwenTool = {
  type: "function",
  function: {
    name: "expand_url",
    description:
      "Follow the redirect headers of a link (max 5 hops, no page content). Use once when a link hides where it goes.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The http(s) URL to follow." },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
};

export function qwenConfigured(): boolean {
  return Boolean(process.env.QWEN_API_KEY);
}

export function qwenModelName(): string {
  return process.env.QWEN_MODEL || "qwen-plus";
}

function baseUrl(): string {
  return (
    process.env.QWEN_BASE_URL ||
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
  ).replace(/\/$/, "");
}

export interface QwenReply {
  content: string | null;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
}

export async function qwenChat(options: {
  messages: QwenMessage[];
  tools?: QwenTool[];
  timeoutMs: number;
}): Promise<QwenReply> {
  const key = process.env.QWEN_API_KEY;
  if (!key) throw new ToolFailure("UPSTREAM_5XX", "the_model", "no key configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: qwenModelName(),
        messages: options.messages,
        temperature: 0.1,
        max_tokens: 300,
        ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
      }),
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ToolFailure("TIMEOUT", "the_model", "model timed out");
    }
    throw new ToolFailure(
      "UPSTREAM_5XX",
      "the_model",
      error instanceof Error ? error.message : "model request failed",
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ToolFailure("UPSTREAM_5XX", "the_model", `model returned ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ToolFailure("UNPARSEABLE", "the_model", "model returned non-JSON");
  }

  const choice = (payload as { choices?: Array<{ message?: Record<string, unknown> }> })
    .choices?.[0]?.message;
  if (!choice) throw new ToolFailure("UNPARSEABLE", "the_model", "empty model reply");

  const toolCalls = Array.isArray(choice.tool_calls)
    ? (choice.tool_calls as Array<{
        id: string;
        function: { name: string; arguments: string };
      }>).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      }))
    : [];

  return {
    content: typeof choice.content === "string" ? choice.content : null,
    toolCalls,
  };
}

/** Models sometimes wrap JSON in fences or prose. Take the first object. */
export function parseJsonReply(content: string | null): Record<string, unknown> | null {
  if (!content) return null;
  const withoutFences = content.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(withoutFences.slice(start, end + 1));
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
