// @vitest-environment jsdom

import { isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { threadHeaderRight } from "../components/thread-header-right";

const native = vi.hoisted(() => ({
  platform: { OS: "ios", Version: "26.0" },
}));

vi.mock("react-native", () => ({
  Platform: native.platform,
  Pressable: "Pressable",
  View: "View",
  Text: "Text",
}));
vi.mock("./native-controls", () => ({ iosAtLeast: () => native.platform.OS === "ios" }));
vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => null }));

const t = (text: string) => text;
const base = {
  inGroup: false,
  readOnly: false,
  hasBot: true,
  t,
  color: "#111",
  destructiveColor: "#c00",
  onGroupSettings: vi.fn(),
  onBotActions: vi.fn(),
  onClearConversation: vi.fn(),
  menuActions: [
    { text: "Open computer", onPress: vi.fn() },
    { text: "Clear conversation", destructive: true, onPress: vi.fn() },
  ],
  computerLabel: "Open computer",
};

beforeEach(() => {
  native.platform.OS = "ios";
  native.platform.Version = "26.0";
  base.onClearConversation.mockClear();
});

function labels(node: ReactNode, found: string[] = []) {
  if (node == null || typeof node === "boolean") return found;
  if (typeof node === "string" || typeof node === "number") {
    found.push(String(node));
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) labels(child, found);
    return found;
  }
  if (!isValidElement(node)) return found;
  const props = node.props as { accessibilityLabel?: string; children?: ReactNode };
  if (props.accessibilityLabel) found.push(props.accessibilityLabel);
  return labels(props.children, found);
}

it("puts Clear conversation beside the bot actions menu", () => {
  const options = threadHeaderRight(base);
  const items = options.unstable_headerRightItems?.({ tintColor: undefined } as never) ?? [];
  expect(items[0]).toMatchObject({
    type: "button",
    label: "Clear conversation",
    tintColor: "#c00",
  });
  expect(items[0]).not.toHaveProperty("icon");
  expect(items[1]).toMatchObject({ type: "menu", label: "Bot actions" });
  const menu = items[1] as { menu: { items: { label: string }[] } };
  expect(menu.menu.items.map((item) => item.label)).toContain("Clear conversation");
  (items[0] as { onPress: () => void }).onPress();
  expect(base.onClearConversation).toHaveBeenCalledOnce();
  expect(labels(options.headerRight?.({} as never))).toEqual(
    expect.arrayContaining(["Clear conversation", "Bot actions"]),
  );
});

it("keeps a group header on settings, without a clear control", () => {
  const options = threadHeaderRight({ ...base, inGroup: true, hasBot: false });
  const items = options.unstable_headerRightItems?.({ tintColor: undefined } as never) ?? [];
  expect(items).toEqual([expect.objectContaining({ type: "button", label: "Group settings" })]);
  expect(labels(options.headerRight?.({} as never))).toEqual(["Group settings"]);
});

it("leaves an archived bot's header for Restore", () => {
  native.platform.OS = "android";
  const options = threadHeaderRight({ ...base, readOnly: true });
  expect(options.unstable_headerRightItems).toBeUndefined();
  expect(labels(options.headerRight?.({} as never))).toEqual(["Bot actions"]);
});
