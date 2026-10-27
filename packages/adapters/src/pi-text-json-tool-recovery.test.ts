import type { AssistantMessage, ToolCall } from "@earendil-works/pi-ai";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { AssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import { describe, expect, it } from "vitest";
import { builtinAgentTools } from "./builtin-tools.js";
import { parametersFor } from "./pi-runtime-tool-parameters.js";
import type { ToolHost } from "./pi-runtime-tools.js";
import { toAgentTools } from "./pi-runtime-tools.js";
import {
  parseTextJsonToolCalls,
  recoverTextJsonToolCallStream,
  recoverTextJsonToolCalls,
} from "./pi-text-json-tool-recovery.js";
import { ENABLE_TOOL_PACK_TOOL, exposePackedTools, resolveEnabledToolPack } from "./tool-packs.js";

const DUMP = `[{"name":"enable_tool_pack","arguments":{"pack":"search"}}, {"name":"ask_user","arguments":{"question":"Would you like any additional information or assistance?","options":["Yes, please.","No, thank you."]}}]`;

function assistant(
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "local",
    model: "dolphin-nemo-tools:12b",
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    timestamp: 1,
  };
}

function toolCalls(message: AssistantMessage): ToolCall[] {
  return message.content.filter((part): part is ToolCall => part.type === "toolCall");
}

async function readStream(inner: AssistantMessageEventStream) {
  const stream = recoverTextJsonToolCallStream(inner);
  const events = [];
  for await (const event of stream) events.push(event);
  return { events, message: await stream.result() };
}

describe("text JSON tool recovery", () => {
  it("turns a sole JSON array of tool calls into Pi toolCall parts", () => {
    const recovered = recoverTextJsonToolCalls(assistant([{ type: "text", text: ` \n${DUMP}\n` }]));
    expect(recovered.stopReason).toBe("toolUse");
    expect(recovered.content.some((part) => part.type === "text")).toBe(false);
    expect(
      toolCalls(recovered).map((call) => ({ name: call.name, arguments: call.arguments })),
    ).toEqual([
      { name: "enable_tool_pack", arguments: { pack: "search" } },
      {
        name: "ask_user",
        arguments: {
          question: "Would you like any additional information or assistance?",
          options: ["Yes, please.", "No, thank you."],
        },
      },
    ]);
    expect(toolCalls(recovered).every((call) => call.id.startsWith("text-json-"))).toBe(true);
  });

  it("leaves ordinary prose unchanged", () => {
    const prose = assistant([
      { type: "text", text: "Search is available in the web pack. I can look that up." },
    ]);
    expect(recoverTextJsonToolCalls(prose)).toBe(prose);
    expect(
      parseTextJsonToolCalls('{"name":"enable_tool_pack","arguments":{"pack":"web"}}'),
    ).toBeUndefined();
    expect(parseTextJsonToolCalls(`\`\`\`json\n${DUMP}\n\`\`\``)).toBeUndefined();
  });

  it("leaves native tool_calls unchanged", () => {
    const native = assistant(
      [
        { type: "text", text: DUMP },
        {
          type: "toolCall",
          id: "call_native",
          name: "web_search",
          arguments: { query: "pi" },
        },
      ],
      "toolUse",
    );
    expect(recoverTextJsonToolCalls(native)).toBe(native);
  });

  it("still routes an invalid pack through enable_tool_pack", async () => {
    const recovered = recoverTextJsonToolCalls(assistant([{ type: "text", text: DUMP }]));
    const packCall = toolCalls(recovered).find((call) => call.name === ENABLE_TOOL_PACK_TOOL);
    if (!packCall) throw new Error("enable_tool_pack was not recovered");
    expect(packCall.arguments).toEqual({ pack: "search" });

    const enable = exposePackedTools(builtinAgentTools, null).find(
      (tool) => tool.name === ENABLE_TOOL_PACK_TOOL,
    );
    if (!enable) throw new Error("enable_tool_pack was not packed");
    expect(
      validateToolArguments(
        {
          name: enable.name,
          description: enable.description,
          parameters: parametersFor(enable),
        },
        packCall,
      ),
    ).toEqual({ pack: "search" });

    const listed = resolveEnabledToolPack(builtinAgentTools, "search");
    expect(listed).toEqual({
      error: expect.stringContaining("web"),
    });
    if (!("error" in listed)) throw new Error("expected the unknown-pack error");
    expect(listed.error).toContain('Unknown tool pack "search"');

    const events: unknown[] = [];
    const host = {
      signal: new AbortController().signal,
      depth: 0,
      pausePending: false,
      queue: { push: (event: unknown) => events.push(event) },
      toolCallBudget: { count: 0, exceeded: false, limit: 0, inFlight: 0 },
      applyToolPack: (pack: string) => resolveEnabledToolPack(builtinAgentTools, pack),
    } as unknown as ToolHost;
    const tool = toAgentTools(
      [
        {
          name: ENABLE_TOOL_PACK_TOOL,
          description: "Load one pack.",
          inputSchema: {
            type: "object",
            properties: { pack: { type: "string" } },
            required: ["pack"],
          },
        },
      ],
      host,
    )[0];
    if (!tool) throw new Error("enable_tool_pack was not exposed");
    const result = await tool.execute(packCall.id, packCall.arguments);
    const text = result.content.map((part) => (part.type === "text" ? part.text : "")).join("");
    expect(text).toContain('Unknown tool pack "search"');
    expect(text).toContain("web");
    expect(events).toEqual([
      expect.objectContaining({
        type: "tool",
        name: ENABLE_TOOL_PACK_TOOL,
        args: { pack: "search" },
      }),
    ]);
  });

  it("does not stream a sole JSON tool dump, and still streams prose and native tool calls", async () => {
    const dump = assistant([{ type: "text", text: DUMP }]);
    const dumped = new AssistantMessageEventStream();
    const dumpRead = readStream(dumped);
    dumped.push({ type: "start", partial: { ...dump, content: [] } });
    dumped.push({
      type: "text_delta",
      contentIndex: 0,
      delta: DUMP,
      partial: dump,
    });
    dumped.push({ type: "done", reason: "stop", message: dump });
    dumped.end(dump);
    const recovered = await dumpRead;
    expect(recovered.events.some((event) => event.type === "text_delta")).toBe(false);
    expect(toolCalls(recovered.message).map((call) => call.name)).toEqual([
      "enable_tool_pack",
      "ask_user",
    ]);
    expect(assistantText(recovered.message)).toBe("");

    const prose = assistant([{ type: "text", text: "Hello from the local model." }]);
    const spoken = new AssistantMessageEventStream();
    const proseRead = readStream(spoken);
    spoken.push({ type: "start", partial: { ...prose, content: [] } });
    spoken.push({
      type: "text_delta",
      contentIndex: 0,
      delta: "Hello from the local model.",
      partial: prose,
    });
    spoken.push({ type: "done", reason: "stop", message: prose });
    spoken.end(prose);
    const proseEvents = await proseRead;
    expect(proseEvents.events.some((event) => event.type === "text_delta")).toBe(true);
    expect(proseEvents.message).toBe(prose);

    const native = assistant(
      [{ type: "toolCall", id: "call_native", name: "web_search", arguments: { query: "pi" } }],
      "toolUse",
    );
    const nativeCall = native.content[0];
    if (nativeCall?.type !== "toolCall") throw new Error("expected a native tool call");
    const wired = new AssistantMessageEventStream();
    const nativeRead = readStream(wired);
    wired.push({ type: "start", partial: { ...native, content: [] } });
    wired.push({ type: "toolcall_start", contentIndex: 0, partial: native });
    wired.push({
      type: "toolcall_end",
      contentIndex: 0,
      toolCall: nativeCall,
      partial: native,
    });
    wired.push({ type: "done", reason: "toolUse", message: native });
    wired.end(native);
    const nativeEvents = await nativeRead;
    expect(nativeEvents.events.some((event) => event.type === "toolcall_end")).toBe(true);
    expect(nativeEvents.message).toBe(native);
    expect(toolCalls(nativeEvents.message)).toEqual([nativeCall]);
  });
});

function assistantText(message: AssistantMessage): string {
  return message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
}
