import { randomUUID } from "node:crypto";
import type { AssistantMessage, AssistantMessageEvent, JsonObject } from "@earendil-works/pi-ai";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import { assistantText } from "./pi-runtime-errors.js";

const EMPTY_USAGE: AssistantMessage["usage"] = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/**
 * Some local models (dolphin-nemo-tools and other Mistral-style tool models)
 * print a JSON array of `{name, arguments}` as assistant text instead of
 * OpenAI `tool_calls`. Pi then shows that JSON as the reply and never runs
 * the tools. A message whose text is only that array becomes toolCall parts
 * so the existing agent loop executes them.
 */
export function recoverTextJsonToolCalls(message: AssistantMessage): AssistantMessage {
  return textJsonToolMessage(message) ?? message;
}

/**
 * Hold text that might still be a sole tool-call JSON array, then replace the
 * finished message with toolCall parts. Prose is forwarded as it arrives.
 * Native tool_calls are forwarded unchanged.
 */
export function recoverTextJsonToolCallStream(
  inner: AssistantMessageEventStream,
): AssistantMessageEventStream {
  const output = new AssistantMessageEventStream();
  void pumpTextJsonToolRecovery(inner, output);
  return output;
}

function textJsonToolMessage(message: AssistantMessage): AssistantMessage | undefined {
  if (message.stopReason === "error" || message.stopReason === "aborted") return undefined;
  const kept: AssistantMessage["content"] = [];
  let text = "";
  for (const part of message.content) {
    if (part.type === "toolCall") return undefined;
    if (part.type === "text") {
      text += part.text;
      continue;
    }
    if (part.type === "thinking") {
      kept.push(part);
      continue;
    }
    return undefined;
  }
  const calls = parseTextJsonToolCalls(text);
  if (!calls) return undefined;
  const { errorMessage: _dropped, ...rest } = message;
  return {
    ...rest,
    stopReason: "toolUse",
    content: [
      ...kept,
      ...calls.map((call) => ({
        type: "toolCall" as const,
        id: `text-json-${randomUUID()}`,
        name: call.name,
        arguments: call.arguments,
      })),
    ],
  };
}

/** A whole assistant text that is only a JSON array of `{name, arguments}`. */
export function parseTextJsonToolCalls(
  text: string,
): { name: string; arguments: JsonObject }[] | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[")) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
  const calls: { name: string; arguments: JsonObject }[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== "string" || record.name.trim().length === 0) return undefined;
    const args = argumentsObject(record.arguments);
    if (!args) return undefined;
    calls.push({ name: record.name.trim(), arguments: args });
  }
  return calls;
}

function argumentsObject(value: unknown): JsonObject | undefined {
  let candidate = value;
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    if (!trimmed.startsWith("{")) return undefined;
    try {
      candidate = JSON.parse(trimmed) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
  return candidate as JsonObject;
}

/** Empty or still a JSON array prefix. Anything else is ordinary reply text. */
function mayStillBeTextJsonToolDump(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.length === 0 || trimmed.startsWith("[");
}

async function pumpTextJsonToolRecovery(
  inner: AssistantMessageEventStream,
  output: AssistantMessageEventStream,
): Promise<void> {
  const held: AssistantMessageEvent[] = [];
  let phase: "open" | "holding" | "passthrough" = "open";
  let seenText = "";
  let settled = false;

  const flush = () => {
    for (const event of held) output.push(event);
    held.length = 0;
  };

  const settleRecovered = (message: AssistantMessage): boolean => {
    const recovered = textJsonToolMessage(message);
    if (!recovered) return false;
    settled = true;
    output.push({ type: "done", reason: "toolUse", message: recovered });
    output.end(recovered);
    return true;
  };

  const settleOriginal = (event: Extract<AssistantMessageEvent, { type: "done" | "error" }>) => {
    if (settled) return;
    settled = true;
    phase = "passthrough";
    flush();
    output.push(event);
    output.end(event.type === "done" ? event.message : event.error);
  };

  try {
    for await (const event of inner) {
      if (event.type === "done") {
        if (phase !== "passthrough" && settleRecovered(event.message)) return;
        settleOriginal(event);
        return;
      }
      if (event.type === "error") {
        settleOriginal(event);
        return;
      }
      if (phase === "passthrough") {
        output.push(event);
        continue;
      }
      if (
        event.type === "toolcall_start" ||
        event.type === "toolcall_delta" ||
        event.type === "toolcall_end"
      ) {
        phase = "passthrough";
        flush();
        output.push(event);
        continue;
      }
      if (event.type === "text_start" || event.type === "text_delta" || event.type === "text_end") {
        held.push(event);
        phase = "holding";
        if (event.type === "text_delta") seenText += event.delta;
        const partialText = assistantText(event.partial);
        if (partialText.length >= seenText.length) seenText = partialText;
        if (!mayStillBeTextJsonToolDump(seenText)) {
          phase = "passthrough";
          flush();
        }
        continue;
      }
      if (phase === "holding") held.push(event);
      else output.push(event);
    }
    if (settled) return;
    const final = await inner.result();
    if (phase !== "passthrough" && settleRecovered(final)) return;
    if (settled) return;
    settled = true;
    phase = "passthrough";
    flush();
    output.end(final);
  } catch (error) {
    if (settled) return;
    settled = true;
    phase = "passthrough";
    flush();
    const failure: AssistantMessage = {
      role: "assistant",
      content: [],
      api: "openai-completions",
      provider: "local",
      model: "local",
      usage: EMPTY_USAGE,
      stopReason: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    };
    output.push({ type: "error", reason: "error", error: failure });
    output.end(failure);
  }
}
