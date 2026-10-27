// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useThreadHeader } from "../components/thread/thread-header";

type HeaderProps = {
  inGroup: boolean;
  onClearConversation: () => void;
  menuActions: { text: string; onPress: () => void }[];
};

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  alert: vi.fn(),
  header: null as HeaderProps | null,
}));

vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
  Platform: { OS: "ios", Version: "26" },
  Modal: () => null,
  Pressable: () => null,
  Text: () => null,
  View: () => null,
}));
vi.mock("expo-router", () => ({
  useNavigation: () => ({ setOptions: vi.fn() }),
  useRoute: () => ({ key: "thread-1" }),
  useRouter: () => ({
    push: vi.fn(),
    dismissAll: vi.fn(),
    replace: vi.fn(),
    setParams: vi.fn(),
  }),
}));
vi.mock("./api", () => ({ rpc: mocks.rpc }));
vi.mock("./appearance", () => ({
  mobileTokens: () => ({ foreground: "#111", destructive: "#c00" }),
}));
vi.mock("./native", () => ({ useResolvedAppearance: () => "light" }));
vi.mock("./i18n", () => {
  const t = (text: string) => text;
  return { t, useI18n: () => ({ t }) };
});
vi.mock("./user-error", () => ({ errorText: () => "failure" }));
vi.mock("./archived-chats", () => ({ notifyArchivedChatsChanged: vi.fn() }));
vi.mock("./bot-lifecycle", () => ({
  confirmDeleteBot: vi.fn(),
  restoreArchivedBot: vi.fn(),
}));
vi.mock("./search-inbox", () => ({ removeFromSearchInbox: vi.fn() }));
vi.mock("./thread-edges", () => ({ threadEdgeOptions: () => ({}) }));
vi.mock("../components/chat-header-title", () => ({ publishChatTitle: () => () => undefined }));
vi.mock("../components/sheet-header", () => ({ trailingHeaderOptions: () => ({}) }));
vi.mock("../components/thread-header-right", () => ({
  threadHeaderRight: (props: HeaderProps) => {
    mocks.header = props;
    return {};
  },
}));

let container: HTMLDivElement;
let root: Root;
const onCleared = vi.fn();

function Header({ inGroup = false }: { inGroup?: boolean }) {
  useThreadHeader({
    botId: inGroup ? undefined : "bot-1",
    groupId: inGroup ? "group-1" : undefined,
    inGroup,
    readOnly: false,
    displayName: inGroup ? "Draft team" : "Helper",
    composingBots: "",
    styles: { headerActions: {} } as Parameters<typeof useThreadHeader>[0]["styles"],
    onCleared,
  });
  return null;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.rpc.mockReset();
  mocks.alert.mockReset();
  mocks.header = null;
  onCleared.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function confirmClear() {
  const buttons = mocks.alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
  return buttons.find((button) => button.text === "Clear")!;
}

it("confirms from the header button and from the actions menu, then clears the bot", async () => {
  act(() => root.render(<Header />));
  const header = mocks.header!;
  expect(header.menuActions.map((action) => action.text)).toContain("Clear conversation");

  header.onClearConversation();
  expect(mocks.alert).toHaveBeenCalledWith(
    "Clear conversation?",
    "This removes every message and stops current work. The bot, computer, memory, and routines are kept.",
    expect.any(Array),
  );
  mocks.rpc.mockResolvedValueOnce({});
  await act(async () => confirmClear().onPress?.());
  expect(mocks.rpc).toHaveBeenCalledWith("threads/clear", { botId: "bot-1" });
  expect(onCleared).toHaveBeenCalledOnce();

  header.menuActions.find((action) => action.text === "Clear conversation")!.onPress();
  expect(mocks.alert).toHaveBeenCalledTimes(2);
  mocks.rpc.mockRejectedValueOnce(new Error("offline"));
  await act(async () => confirmClear().onPress?.());
  expect(mocks.alert).toHaveBeenLastCalledWith("Could not clear conversation", "failure");
  expect(onCleared).toHaveBeenCalledOnce();
});

it("does not offer header clear on a group chat", () => {
  act(() => root.render(<Header inGroup />));
  expect(mocks.header?.inGroup).toBe(true);
  mocks.header?.onClearConversation();
  expect(mocks.alert).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
