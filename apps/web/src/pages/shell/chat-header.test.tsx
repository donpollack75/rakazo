// @vitest-environment jsdom

import type { Bot, Group } from "@rakazo/contracts";
import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChatHeader } from "./chat-header";

vi.mock("@lingui/react/macro", () => {
  const t = (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((text, part, index) => `${text}${index > 0 ? values[index - 1] : ""}${part}`, "");
  return { useLingui: () => ({ t }), Trans: ({ children }: { children: ReactNode }) => children };
});
vi.mock("@rakazo/ui-web", () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: ComponentProps<"button"> & { variant?: string; size?: string }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  BotAvatar: () => null,
  GroupAvatar: () => null,
}));
vi.mock("../../components/IconTooltip", () => ({
  IconTooltip: ({ children }: { children: ReactNode }) => children,
}));

const bot = { id: "bot-1", name: "Helper", color: "#111", status: "idle" } as Bot;
const group = { id: "group-1", name: "Draft team", members: [] } as unknown as Group;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderHeader(props: Partial<ComponentProps<typeof ChatHeader>> = {}) {
  const onClearConversation = vi.fn();
  act(() => {
    root.render(
      <ChatHeader
        inGroup={false}
        active={bot}
        activeGroup={undefined}
        activeSnapshot={null}
        phoneCallsEnabled={false}
        inCall={false}
        computerPanelOpen={false}
        onOpenNavigation={() => undefined}
        onOpenChatSettings={() => undefined}
        onClearConversation={onClearConversation}
        onCall={() => undefined}
        onToggleComputer={() => undefined}
        {...props}
      />,
    );
  });
  return { onClearConversation };
}

function button(name: string) {
  return [...container.querySelectorAll("button")].find(
    (item) => item.textContent?.includes(name) || item.getAttribute("aria-label") === name,
  );
}

it("shows Clear conversation on a bot chat and opens the existing confirm flow", () => {
  const { onClearConversation } = renderHeader();
  const clear = button("Clear conversation");
  expect(clear).toBeTruthy();
  expect(clear?.className).toContain("text-destructive");
  expect(button("Agent computer")).toBeTruthy();
  act(() => clear!.click());
  expect(onClearConversation).toHaveBeenCalledOnce();
});

it("shows Clear conversation on a group chat", () => {
  const { onClearConversation } = renderHeader({
    inGroup: true,
    active: undefined,
    activeGroup: group,
  });
  const clear = button("Clear conversation");
  expect(clear).toBeTruthy();
  expect(button("Agent computer")).toBeUndefined();
  act(() => clear!.click());
  expect(onClearConversation).toHaveBeenCalledOnce();
});

it("hides Clear conversation until a bot or group is open", () => {
  renderHeader({ active: undefined, activeGroup: undefined });
  expect(button("Clear conversation")).toBeUndefined();
});
