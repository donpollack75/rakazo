import { BUILTIN_TOOL_NAMES } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { agentConnectionTools, builtinAgentTools } from "./builtin-tools.js";
import { estimateContextTokens, selectContext } from "./context-selection.js";
import { effectiveOutputReserve } from "./pi-runtime-limits.js";
import { parametersFor } from "./pi-runtime-tool-parameters.js";
import { userTurnInstructions } from "./run-instructions.js";
import { runReplyGuidance } from "./run-replies.js";
import { selectBuiltinToolsForRun } from "./run-tool-selection.js";
import {
  CONNECTORS_PACK_ID,
  CORE_TOOL_NAMES,
  ENABLE_TOOL_PACK_TOOL,
  exposePackedTools,
  modelToolsForTurn,
  PACKED_TOOL_GUIDANCE,
  resolveEnabledToolPack,
  shouldDeferToolSchemas,
  TOOL_PACK_CONTEXT_WINDOW,
  TOOL_PACK_DIALOGUE_TOKENS,
  TOOL_PACKS,
  turnContextWithToolPack,
} from "./tool-packs.js";

const fullCatalog = () => [
  ...selectBuiltinToolsForRun({
    ticketBoardEnabled: true,
    phoneCallsEnabled: true,
    historyRetrievalEnabled: true,
    graphicalToolsAllowed: true,
    pageBrowserAllowed: true,
    groupId: null,
    trigger: "user",
    semanticMemoryEnabled: true,
    semanticMemoryForgets: true,
    cloudAgentEnabled: true,
    mediaImagesEnabled: true,
    mediaVideoEnabled: true,
    messagingChannelRun: false,
    voiceCall: true,
    fleetManagement: true,
    followUpFromUser: true,
    userComputer: true,
  }),
  ...agentConnectionTools,
];

function schemas(tools: readonly { name: string; description: string; inputSchema: unknown }[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: JSON.parse(
      JSON.stringify(
        parametersFor({
          name: tool.name,
          description: tool.description,
          inputSchema:
            tool.inputSchema && typeof tool.inputSchema === "object"
              ? (tool.inputSchema as Record<string, unknown>)
              : {},
        }),
      ),
    ) as unknown,
  }));
}

function packedPrompt(): string {
  return userTurnInstructions({
    botInstructions: "You are a helpful assistant.",
    groupContext: undefined,
    messagingContext: undefined,
    redactedMemoryContext: undefined,
    redactedScratchpadContext: undefined,
    hasHistoricalContext: false,
    historyRetrievalEnabled: true,
    computerInstruction: PACKED_TOOL_GUIDANCE,
    pageBrowserAllowed: true,
    workspaceInstruction: "This entire computer workspace is your private home.",
    agentEnvironmentInstruction: undefined,
    botDirectory: undefined,
    pluginLine: "No plugins are connected yet.",
    agentSkillsLine: undefined,
    taughtSkillsLine: undefined,
    replyGuidance: runReplyGuidance("user"),
    packed: true,
    offeredFleetTools: [],
  })
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
}

function dialogueRoom(
  systemPrompt: string,
  tools: readonly { name: string; description: string; inputSchema: unknown }[],
) {
  const outputReserve = effectiveOutputReserve(TOOL_PACK_CONTEXT_WINDOW, 4_096);
  const fixed = estimateContextTokens(systemPrompt) + estimateContextTokens(schemas(tools));
  return {
    outputReserve,
    fixed,
    room: TOOL_PACK_CONTEXT_WINDOW - outputReserve - fixed,
  };
}

describe("builtin tool packs", () => {
  it("assigns every builtin tool to core or exactly one pack", () => {
    const assigned = new Map<string, string>();
    for (const name of CORE_TOOL_NAMES) assigned.set(name, "core");
    for (const pack of TOOL_PACKS) {
      expect(pack.tools.length).toBeGreaterThan(0);
      expect(pack.tools.length).toBeLessThanOrEqual(15);
      for (const name of pack.tools) {
        expect(assigned.has(name), name).toBe(false);
        assigned.set(name, pack.id);
      }
    }
    expect([...assigned.keys()].sort()).toEqual([...BUILTIN_TOOL_NAMES].sort());
    expect(builtinAgentTools.every((tool) => assigned.has(tool.name))).toBe(true);
  });

  it("sends only core schemas for a local model even when the configured window is large", () => {
    const catalog = fullCatalog();
    expect(catalog.length).toBeGreaterThan(60);
    const turn = modelToolsForTurn({
      tools: catalog,
      provider: "local",
      contextWindow: 40_960,
      trigger: "user",
    });
    expect(turn.deferred).toBe(true);
    expect(turn.catalog).toHaveLength(catalog.length);
    const names = turn.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([ENABLE_TOOL_PACK_TOOL, "ask_user", "end_call", "message_user"].sort());
    expect(names).not.toContain("shell");
    expect(names).not.toContain("web_search");
    expect(names).not.toContain("computer_act");
    const enable = turn.tools.find((tool) => tool.name === ENABLE_TOOL_PACK_TOOL);
    expect(enable?.description).toContain("none to unload");
    expect(enable?.description).toContain("web");
    expect(PACKED_TOOL_GUIDANCE).toContain("web for search and fetch");
    expect(PACKED_TOOL_GUIDANCE).toContain("ask_user");
    expect(PACKED_TOOL_GUIDANCE).toContain("enable_tool_pack");
    const packField = JSON.stringify(enable?.inputSchema);
    expect(packField).toContain("files");
    expect(packField).toContain("schedule_create");
    expect(packField).toContain("list");
    expect(packField).toContain("none");
    expect(packField).not.toContain('"enum"');
  });

  it("keeps every schema for a hosted model with room, and packs a small window", () => {
    const catalog = fullCatalog();
    const hosted = modelToolsForTurn({
      tools: catalog,
      provider: "openrouter",
      contextWindow: 32_768,
      trigger: "user",
    });
    expect(hosted.deferred).toBe(false);
    expect(hosted.tools.map((tool) => tool.name)).toEqual(catalog.map((tool) => tool.name));
    expect(hosted.tools.some((tool) => tool.name === ENABLE_TOOL_PACK_TOOL)).toBe(false);

    expect(
      shouldDeferToolSchemas({ provider: "openai", contextWindow: 8_192, trigger: "user" }),
    ).toBe(true);
    expect(
      shouldDeferToolSchemas({ provider: "openai", contextWindow: 8_193, trigger: "user" }),
    ).toBe(false);
    expect(
      shouldDeferToolSchemas({ provider: "local", contextWindow: 32_768, trigger: "created" }),
    ).toBe(false);
    expect(
      shouldDeferToolSchemas({
        provider: "local",
        contextWindow: 4_096,
        trigger: "user",
        scripted: true,
      }),
    ).toBe(false);
  });

  it("loads one pack at a time and still reaches every builtin plus connectors", () => {
    const connector = {
      name: "mcp__gmail__send",
      description: "Send mail",
      inputSchema: { type: "object", properties: {} },
    };
    const catalog = [...fullCatalog(), connector];
    const files = resolveEnabledToolPack(catalog, "Files");
    expect(files).toEqual(
      expect.objectContaining({
        pack: "files",
      }),
    );
    if ("error" in files) throw new Error(files.error);
    if ("list" in files) throw new Error("expected a pack");
    expect(files.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["list_files", "read_file", "write_file", "attach_file", "open_path"]),
    );
    expect(files.tools.some((tool) => tool.name === "shell")).toBe(false);
    expect(files.tools.some((tool) => tool.name === "web_search")).toBe(false);
    expect(files.tools.some((tool) => tool.name === "ask_user")).toBe(true);
    expect(files.tools.some((tool) => tool.name === ENABLE_TOOL_PACK_TOOL)).toBe(true);

    const listed = resolveEnabledToolPack(catalog, "list");
    expect(listed).toEqual({
      list: expect.arrayContaining([{ id: "files", purpose: "read and write files" }]),
    });

    const web = resolveEnabledToolPack(catalog, "web");
    if ("error" in web || "list" in web) throw new Error("expected the web pack");
    expect(web.tools.some((tool) => tool.name === "web_fetch")).toBe(true);
    expect(web.tools.some((tool) => tool.name === "read_file")).toBe(false);

    const connectors = resolveEnabledToolPack(catalog, CONNECTORS_PACK_ID);
    if ("error" in connectors || "list" in connectors) throw new Error("expected connectors");
    expect(connectors.tools.map((tool) => tool.name)).toContain("mcp__gmail__send");
    expect(connectors.tools.some((tool) => tool.name === "read_file")).toBe(false);

    const unloaded = resolveEnabledToolPack(catalog, "none");
    if ("error" in unloaded || "list" in unloaded) throw new Error("expected core");
    expect(unloaded.pack).toBeNull();
    expect(unloaded.tools.some((tool) => tool.name === "read_file")).toBe(false);
    expect(unloaded.tools.some((tool) => tool.name === ENABLE_TOOL_PACK_TOOL)).toBe(true);

    expect(resolveEnabledToolPack(catalog, "missing")).toEqual({
      error: expect.stringContaining("files"),
    });
  });

  it("fits a hello, and core plus each pack, in a 4096 window with dialogue room", () => {
    const catalog = [...builtinAgentTools, ...agentConnectionTools];
    const core = exposePackedTools(catalog, null);
    const prompt = packedPrompt();
    const coreRoom = dialogueRoom(prompt, core);
    expect(coreRoom.room, `core leaves ${coreRoom.room}`).toBeGreaterThanOrEqual(
      TOOL_PACK_DIALOGUE_TOKENS,
    );
    expect(core.length).toBeLessThanOrEqual(8);

    selectContext([{ role: "user", content: "hello" }], {
      budget: {
        contextWindow: TOOL_PACK_CONTEXT_WINDOW,
        outputReserve: coreRoom.outputReserve,
        systemPrompt: prompt,
        tools: schemas(core),
      },
      strategy: "current",
    });

    const packs = [...TOOL_PACKS.map((pack) => pack.id), CONNECTORS_PACK_ID];
    const connector = {
      name: "mcp__gmail__send",
      description: "Send mail",
      inputSchema: { type: "object", properties: { to: { type: "string" } } },
    };
    const withConnector = [...catalog, connector];
    for (const id of packs) {
      const loaded = exposePackedTools(id === CONNECTORS_PACK_ID ? withConnector : catalog, id);
      const room = dialogueRoom(prompt, loaded);
      expect(room.room, `${id} leaves ${room.room} (fixed ${room.fixed})`).toBeGreaterThanOrEqual(
        TOOL_PACK_DIALOGUE_TOKENS,
      );
      const selected = selectContext([{ role: "user", content: "hello" }], {
        budget: {
          contextWindow: TOOL_PACK_CONTEXT_WINDOW,
          outputReserve: room.outputReserve,
          systemPrompt: prompt,
          tools: schemas(loaded),
        },
        strategy: "current",
      });
      expect(selected.messages).toEqual([{ role: "user", content: "hello" }]);
    }

    const schedule = schemas(exposePackedTools(catalog, "schedule_create")).find(
      (tool) => tool.name === "schedule_create",
    );
    expect(schedule?.parameters).toMatchObject({ type: "object" });
    expect(schedule?.parameters).not.toHaveProperty("oneOf");

    expect(() =>
      selectContext([{ role: "user", content: "hello" }], {
        budget: {
          contextWindow: TOOL_PACK_CONTEXT_WINDOW,
          outputReserve: coreRoom.outputReserve,
          systemPrompt: prompt,
          tools: schemas(catalog),
        },
        strategy: "current",
      }),
    ).toThrow(/context/);
  });

  it("drops a previous pack's schema announcement when the next pack loads", () => {
    const next = turnContextWithToolPack(
      {
        messages: [
          { role: "system", content: "You are a bot.", toolsAdded: [{ name: "ask_user" }] },
          { role: "system", content: "", toolsAdded: [{ name: "read_file", parameters: {} }] },
          { role: "user", content: "hello" },
          { role: "system", content: "", toolsRemoved: [{ name: "read_file" }] },
        ],
        tools: [],
      },
      [{ name: "web_search" }],
    );
    expect(next.messages).toEqual([
      { role: "system", content: "You are a bot.", toolsAdded: [{ name: "ask_user" }] },
      { role: "user", content: "hello" },
    ]);
    expect(next.tools).toEqual([{ name: "web_search" }]);
  });
});
