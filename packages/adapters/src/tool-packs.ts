import type { ConnectorTool } from "@rakazo/adapter-kit";
import { LOCAL_PROVIDER_ID } from "./pi-local-provider.js";

/** Model-facing tool that loads one non-core pack for the rest of the chat. */
export const ENABLE_TOOL_PACK_TOOL = "enable_tool_pack";

/**
 * Live Ollama often loads 4096 tokens even when the configured window is larger.
 * Packs are sized so a hello still fits in that window.
 */
export const TOOL_PACK_CONTEXT_WINDOW = 4_096;

/**
 * Tokens that must remain for the conversation after the system prompt, the core
 * schemas, one pack, and the reserved reply. Measured with the context estimator.
 */
export const TOOL_PACK_DIALOGUE_TOKENS = 1_500;

/**
 * Hosted models at or below this window defer builtin schemas the same way the
 * local provider always does. Above it, every eligible tool is sent as before.
 */
export const SMALL_CONTEXT_TOOL_PACK_WINDOW = 8_192;

/** Chat tools present on every packed turn. Other builtins stay callable via a pack. */
export const CORE_TOOL_NAMES = ["ask_user", "message_user", "end_call"] as const;

export interface ToolPack {
  id: string;
  /** A few words, returned when the model asks for the pack list. */
  purpose: string;
  tools: readonly string[];
}

/**
 * One pack at a time. Fat schemas (screen actions, schedules, secrets) sit alone
 * so core plus that pack still leaves dialogue room in a 4096 window.
 */
export const TOOL_PACKS: readonly ToolPack[] = [
  { id: "web", purpose: "search and fetch", tools: ["web_search", "web_fetch"] },
  {
    id: "files",
    purpose: "read and write files",
    tools: ["list_files", "read_file", "write_file", "attach_file", "open_path"],
  },
  { id: "shell", purpose: "run commands", tools: ["shell", "user_computer_shell"] },
  {
    id: "desktop",
    purpose: "see the screen",
    tools: ["computer_observe", "request_takeover", "launch_app"],
  },
  { id: "desktop_act", purpose: "control the screen", tools: ["computer_act"] },
  { id: "browser", purpose: "open a page", tools: ["browser_navigate", "browser_snapshot"] },
  { id: "browser_act", purpose: "use the page", tools: ["browser_act"] },
  {
    id: "memory",
    purpose: "save facts",
    tools: ["remember", "save_shared_memory", "save_memory", "recall_memory", "forget_memory"],
  },
  { id: "history", purpose: "search this chat", tools: ["search_history", "read_history"] },
  {
    id: "scratchpad",
    purpose: "tasks and notes",
    tools: [
      "task_catalog",
      "scratchpad_list",
      "scratchpad_add",
      "scratchpad_update",
      "scratchpad_complete",
      "scratchpad_remove",
    ],
  },
  {
    id: "tickets",
    purpose: "ticket board",
    tools: ["board_tickets", "ticket_get", "ticket_create", "ticket_update", "ticket_comment"],
  },
  { id: "schedule", purpose: "list routines", tools: ["schedule_list", "schedule_cancel"] },
  { id: "schedule_create", purpose: "create a routine", tools: ["schedule_create"] },
  { id: "schedule_update", purpose: "edit a routine", tools: ["schedule_update"] },
  { id: "secrets", purpose: "list credentials", tools: ["list_secrets", "forget_secret"] },
  { id: "secret_ask", purpose: "ask for a credential", tools: ["request_secret"] },
  { id: "secret_make", purpose: "generate a credential", tools: ["generate_secret"] },
  { id: "secret_http", purpose: "call with a credential", tools: ["secret_request"] },
  {
    id: "skills",
    purpose: "skills",
    tools: ["skill_read", "skill_create", "skill_update", "skill_delete"],
  },
  {
    id: "media",
    purpose: "images and charts",
    tools: ["render_plot", "generate_image", "generate_video"],
  },
  { id: "voice", purpose: "phone the user", tools: ["call_user"] },
  {
    id: "cloud",
    purpose: "cloud coding agents",
    tools: ["cloud_agent_launch", "cloud_agent_status", "cloud_agent_reply", "cloud_agent_cancel"],
  },
  { id: "integrations", purpose: "connect an app", tools: ["connect_app", "add_mcp_server"] },
  { id: "subagent", purpose: "helper this turn", tools: ["run_subagent"] },
  { id: "bots_create", purpose: "new bot or space", tools: ["create_space", "spawn_bot"] },
  {
    id: "bots_edit",
    purpose: "edit this bot",
    tools: ["update_bot", "propose_instructions_update"],
  },
  {
    id: "bots_message",
    purpose: "message or archive",
    tools: ["message_bot", "handoff_to_bot", "archive_bot"],
  },
  {
    id: "fleet",
    purpose: "groups",
    tools: ["list_fleet", "create_group", "update_group"],
  },
  {
    id: "fleet_edit",
    purpose: "edit another bot",
    tools: ["organize_bot", "set_child_instructions", "set_child_bot_model"],
  },
  { id: "child_routine", purpose: "schedule another bot", tools: ["create_child_routine"] },
  {
    id: "agents",
    purpose: "other owners",
    tools: ["connect_agent", "respond_agent_connection", "message_agent"],
  },
];

/** Connected-app tools that are not builtins. Loaded as its own pack. */
export const CONNECTORS_PACK_ID = "connectors";

const CONNECTORS_PACK: ToolPack = {
  id: CONNECTORS_PACK_ID,
  purpose: "connected app tools",
  tools: [],
};

/**
 * Replaces the long computer essay on a packed turn. The tools stay callable
 * after enable_tool_pack; this only keeps their instructions out of the first prompt.
 */
export const PACKED_TOOL_GUIDANCE =
  "Answer in chat when you can. Do not pair ask_user with enable_tool_pack when a plain answer works. Call enable_tool_pack with one pack id (web for search and fetch) to load that pack for the rest of this chat; it replaces the pack already loaded. Pass none to unload. If a purchase, send, or submission differs from what the user confirmed, show the difference and confirm again first.";

/** Replaces the long progress essay on a packed turn. message_user stays available. */
export const PACKED_REPLY_GUIDANCE =
  "Put the complete final answer in your normal reply. message_user is only a short progress note during long work.";

const CORE_TOOL_NAME_SET: ReadonlySet<string> = new Set(CORE_TOOL_NAMES);

const packIdByTool = new Map<string, string>();
for (const pack of TOOL_PACKS) {
  for (const name of pack.tools) {
    if (CORE_TOOL_NAME_SET.has(name) || packIdByTool.has(name)) {
      throw new Error(`Builtin tool ${name} is assigned to more than one pack`);
    }
    packIdByTool.set(name, pack.id);
  }
}

export function shouldDeferToolSchemas(input: {
  provider: string;
  contextWindow?: number;
  trigger?: string;
  /** Scripted runs do not send schemas to a model. */
  scripted?: boolean;
}): boolean {
  if (input.scripted || input.trigger === "created") return false;
  if (input.provider === LOCAL_PROVIDER_ID) return true;
  return (
    typeof input.contextWindow === "number" &&
    Number.isFinite(input.contextWindow) &&
    input.contextWindow <= SMALL_CONTEXT_TOOL_PACK_WINDOW
  );
}

export function modelToolsForTurn(input: {
  tools: readonly ConnectorTool[];
  provider: string;
  contextWindow?: number;
  trigger?: string;
  scripted?: boolean;
  activePack?: string | null;
}): { deferred: boolean; tools: ConnectorTool[]; catalog?: ConnectorTool[] } {
  if (!shouldDeferToolSchemas(input)) {
    return { deferred: false, tools: [...input.tools] };
  }
  return {
    deferred: true,
    tools: exposePackedTools(input.tools, input.activePack ?? null),
    catalog: [...input.tools],
  };
}

export function resolveEnabledToolPack(
  catalog: readonly ConnectorTool[],
  requested: string,
):
  | { pack: string | null; tools: ConnectorTool[] }
  | { list: { id: string; purpose: string }[] }
  | { error: string } {
  const available = availablePacks(catalog);
  const normalized = requested.trim().toLowerCase();
  if (normalized === "list") {
    return {
      list: available.map((pack) => ({ id: pack.id, purpose: pack.purpose })),
    };
  }
  if (normalized === "none" || normalized === "core" || normalized === "") {
    return { pack: null, tools: exposePackedTools(catalog, null) };
  }
  const pack = available.find((candidate) => candidate.id === normalized);
  if (!pack) {
    const ids = available.map((candidate) => candidate.id).join(", ");
    return {
      error: ids
        ? `Unknown tool pack "${requested.trim()}". Packs: ${ids}.`
        : `Unknown tool pack "${requested.trim()}". No packs are available on this turn.`,
    };
  }
  return { pack: pack.id, tools: exposePackedTools(catalog, pack.id) };
}

export function exposePackedTools(
  catalog: readonly ConnectorTool[],
  activePack: string | null,
): ConnectorTool[] {
  const byName = new Map(catalog.map((tool) => [tool.name, tool]));
  const exposed: ConnectorTool[] = [];
  const seen = new Set<string>();
  const take = (name: string) => {
    if (seen.has(name)) return;
    const tool = byName.get(name);
    if (!tool) return;
    seen.add(name);
    exposed.push(packedWireTool(tool));
  };
  const packs = availablePacks(catalog);
  exposed.push(enableToolPackTool(packs));
  seen.add(ENABLE_TOOL_PACK_TOOL);
  for (const name of CORE_TOOL_NAMES) take(name);
  if (activePack) {
    const pack = packs.find((candidate) => candidate.id === activePack);
    if (pack?.id === CONNECTORS_PACK_ID) {
      for (const tool of connectorTools(catalog)) take(tool.name);
    } else if (pack) {
      for (const name of pack.tools) take(name);
    }
  }
  return exposed;
}

/**
 * Drop system messages that only announced a previous pack's schemas, so switching
 * packs does not leave every prior schema in the transcript.
 */
export function isDeferredToolDeltaMessage(message: {
  role?: string;
  content?: unknown;
  toolsAdded?: unknown;
  toolsRemoved?: unknown;
}): boolean {
  if (message.role !== "system") return false;
  const content = message.content;
  const empty =
    content == null || content === "" || (Array.isArray(content) && content.length === 0);
  if (!empty) return false;
  const added = Array.isArray(message.toolsAdded) && message.toolsAdded.length > 0;
  const removed = Array.isArray(message.toolsRemoved) && message.toolsRemoved.length > 0;
  return added || removed;
}

export function turnContextWithToolPack<T extends { messages: readonly unknown[] }>(
  context: T,
  tools: unknown,
): T {
  return {
    ...context,
    tools,
    messages: context.messages.filter(
      (message) => !message || typeof message !== "object" || !isDeferredToolDeltaMessage(message),
    ) as T["messages"],
  };
}

function availablePacks(catalog: readonly ConnectorTool[]): ToolPack[] {
  const names = new Set(catalog.map((tool) => tool.name));
  const packs = TOOL_PACKS.filter((pack) => pack.tools.some((name) => names.has(name)));
  if (connectorTools(catalog).length > 0) packs.push(CONNECTORS_PACK);
  return packs;
}

function connectorTools(catalog: readonly ConnectorTool[]): ConnectorTool[] {
  return catalog
    .filter(
      (tool) =>
        tool.name !== ENABLE_TOOL_PACK_TOOL &&
        !CORE_TOOL_NAME_SET.has(tool.name) &&
        !packIdByTool.has(tool.name),
    )
    .slice()
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
}

function enableToolPackTool(packs: readonly ToolPack[]): ConnectorTool {
  const ids = packs.map((pack) => pack.id).join(", ");
  return {
    name: ENABLE_TOOL_PACK_TOOL,
    description:
      "Load one pack for the rest of this chat, replacing any pack already loaded. Chat tools stay. Pass list to see what each pack id does, or none to unload. Search and fetch are web.",
    inputSchema: {
      type: "object",
      properties: {
        pack: {
          type: "string",
          // An unknown id such as "search" must reach the handler, which names the
          // real packs. An enum fails schema validation before that reply is built.
          description: `One pack id (${ids}), list, or none.`,
        },
      },
      required: ["pack"],
      additionalProperties: false,
    },
    readOnly: true,
  };
}

/**
 * Schemas sent to a small context. The executor still validates the original
 * builtin schema; this only drops duplicated branches and long field text.
 */
function packedWireTool(tool: ConnectorTool): ConnectorTool {
  const wire = PACKED_WIRE[tool.name];
  if (!wire) return tool;
  return {
    ...tool,
    ...(wire.description ? { description: wire.description } : {}),
    ...(wire.inputSchema ? { inputSchema: wire.inputSchema } : {}),
  };
}

const packedTimingProperties = {
  cron: { type: "string", description: "5-field cron repeat." },
  every: { type: "number", description: "Repeat amount. Also set unit." },
  unit: { type: "string", enum: ["minutes", "hours", "days"] },
  startAt: { type: "string", description: "ISO start for a repeat." },
  runAt: { type: "string", description: "ISO time for one run." },
  delayMinutes: { type: "number" },
  delaySeconds: { type: "number" },
};

const packedWatchProperty = {
  type: "object",
  description: "Run when this changes. kind is files, command, or tool. everyMinutes minimum 5.",
  properties: {
    kind: { type: "string", enum: ["files", "command", "tool"] },
    paths: { type: "array", items: { type: "string" } },
    command: { type: "string" },
    tool: { type: "string" },
    args: { type: "object" },
    track: { type: "array", items: { type: "string" } },
    everyMinutes: { type: "number" },
    loud: { type: "boolean" },
  },
  required: ["kind"],
};

function packedScheduleSchema(
  extra: Record<string, unknown>,
  required: string[],
  watch: boolean,
): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      ...extra,
      name: { type: "string", description: "Short label." },
      prompt: {
        type: "string",
        description: "Lasting steps for when it fires, including standing preferences.",
      },
      timezone: { type: "string", description: "IANA timezone." },
      ...packedTimingProperties,
      ...(watch ? { watch: packedWatchProperty } : {}),
    },
    required,
    additionalProperties: false,
  };
}

const PACKED_WIRE: Record<string, { description?: string; inputSchema?: Record<string, unknown> }> =
  {
    ask_user: {
      description: "Ask one short multiple-choice question with 2 to 4 options, then wait.",
    },
    message_user: {
      description: "Post one short progress note. Never put the final answer here.",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
      },
    },
    end_call: {
      description: "End the voice call. title is 2-5 words. farewell is one spoken sentence.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          farewell: { type: "string" },
        },
        required: ["title", "farewell"],
      },
    },
    schedule_create: {
      description:
        "Create a reminder or recurring job. Use exactly one timing: cron, every plus unit, runAt, delayMinutes, delaySeconds, or watch.",
      inputSchema: packedScheduleSchema({}, ["name", "prompt"], true),
    },
    schedule_update: {
      description:
        "Edit one schedule by routineId. Send only what changes. Use exactly one timing method when changing when it runs.",
      inputSchema: packedScheduleSchema(
        {
          routineId: { type: "string" },
          active: { type: "boolean", description: "False pauses it." },
        },
        ["routineId"],
        true,
      ),
    },
    create_child_routine: {
      description:
        "Schedule a routine that wakes another bot in this space. Identify it by bot_id or bot_name. Use exactly one timing method. Needs the owner's approval.",
      inputSchema: packedScheduleSchema(
        {
          bot_id: { type: "string" },
          bot_name: { type: "string" },
        },
        ["name", "prompt"],
        false,
      ),
    },
    request_secret: {
      description:
        "Ask in a masked field. credential saves a named secret (auth.type login with an https origin, or command with no origin). connectionId is a one-use connector code. Do not ask for the secret in chat.",
      inputSchema: {
        type: "object",
        properties: {
          label: { type: "string" },
          purpose: { type: "string", enum: ["otp", "password", "api_key"] },
          credential: {
            type: "object",
            properties: {
              name: { type: "string" },
              origin: { type: "string" },
              auth: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["bearer", "header", "basic", "login", "command"] },
                  name: { type: "string" },
                  username: { type: "string" },
                },
                required: ["type"],
              },
            },
            required: ["name", "auth"],
          },
          connectionId: { type: "string" },
          replace: { type: "boolean" },
        },
        required: ["label", "purpose"],
      },
    },
    generate_secret: {
      description:
        "Create a random password or key and save it. You never see the value. type login needs origin and username; type command has neither. command true on a login also saves it for the shell.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["login", "command"] },
          origin: { type: "string" },
          username: { type: "string" },
          command: { type: "boolean" },
          rules: {
            type: "object",
            properties: {
              length: { type: "number" },
              lowercase: { type: "boolean" },
              uppercase: { type: "boolean" },
              digits: { type: "boolean" },
              symbols: { type: "boolean" },
            },
          },
        },
        required: ["name", "type"],
      },
    },
  };
