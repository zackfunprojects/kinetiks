import { describe, it, expect, vi } from "vitest";
import type { PanelMessage } from "@kinetiks/types";
import {
  PANEL_IPC_CHANNEL,
  isPanelMessage,
  createPostMessageBridge,
  createWebviewHostBridge,
  createWebviewGuestBridge,
} from "./panel-bridge";

const ORIGIN = "https://id.kinetiks.ai";
const READY: PanelMessage = { source: "kinetiks-embed", type: "ready", entity_id: null, thread_id: null };
const FOCUS: PanelMessage = { source: "kinetiks-embed", type: "focus", component_id: "sequence", field_name: "tone" };

describe("isPanelMessage", () => {
  it("accepts every known message type with the source tag", () => {
    expect(isPanelMessage(READY)).toBe(true);
    expect(isPanelMessage(FOCUS)).toBe(true);
    expect(isPanelMessage({ source: "kinetiks-embed", type: "visibility", visible: false })).toBe(true);
  });

  it("rejects a missing/wrong source tag", () => {
    expect(isPanelMessage({ type: "ready" })).toBe(false);
    expect(isPanelMessage({ source: "evil", type: "ready" })).toBe(false);
  });

  it("rejects an unknown type and non-objects", () => {
    expect(isPanelMessage({ source: "kinetiks-embed", type: "exec" })).toBe(false);
    expect(isPanelMessage(null)).toBe(false);
    expect(isPanelMessage("ready")).toBe(false);
  });
});

describe("createPostMessageBridge", () => {
  function setup() {
    let listener: ((e: MessageEvent) => void) | null = null;
    const host = {
      addEventListener: vi.fn((_t: "message", l: (e: MessageEvent) => void) => {
        listener = l;
      }),
      removeEventListener: vi.fn(),
    };
    const target = { postMessage: vi.fn() };
    const bridge = createPostMessageBridge({ target, host, origin: ORIGIN });
    const emit = (e: { origin: string; data: unknown }) => listener?.(e as unknown as MessageEvent);
    return { bridge, host, target, emit };
  }

  it("delivers a same-origin, valid inbound message", () => {
    const { bridge, emit } = setup();
    const handler = vi.fn();
    bridge.subscribe(handler);
    emit({ origin: ORIGIN, data: READY });
    expect(handler).toHaveBeenCalledWith(READY);
  });

  it("drops a cross-origin message even if well-formed", () => {
    const { bridge, emit } = setup();
    const handler = vi.fn();
    bridge.subscribe(handler);
    emit({ origin: "https://evil.example", data: READY });
    expect(handler).not.toHaveBeenCalled();
  });

  it("drops a same-origin message without the source tag", () => {
    const { bridge, emit } = setup();
    const handler = vi.fn();
    bridge.subscribe(handler);
    emit({ origin: ORIGIN, data: { type: "ready" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("posts outbound with the locked target origin", () => {
    const { bridge, target } = setup();
    bridge.post(FOCUS);
    expect(target.postMessage).toHaveBeenCalledWith(FOCUS, ORIGIN);
  });

  it("unsubscribe + dispose stop delivery", () => {
    const { bridge, host, emit } = setup();
    const handler = vi.fn();
    const off = bridge.subscribe(handler);
    off();
    emit({ origin: ORIGIN, data: READY });
    expect(handler).not.toHaveBeenCalled();
    bridge.dispose();
    expect(host.removeEventListener).toHaveBeenCalled();
  });
});

describe("createWebviewHostBridge", () => {
  function setup() {
    let listener: ((e: { channel: string; args: unknown[] }) => void) | null = null;
    const webview = {
      send: vi.fn(),
      addEventListener: vi.fn((_t: "ipc-message", l: (e: { channel: string; args: unknown[] }) => void) => {
        listener = l;
      }),
      removeEventListener: vi.fn(),
    };
    const bridge = createWebviewHostBridge(webview);
    const emit = (channel: string, payload: unknown) => listener?.({ channel, args: [payload] });
    return { bridge, webview, emit };
  }

  it("delivers a message on the panel channel", () => {
    const { bridge, emit } = setup();
    const handler = vi.fn();
    bridge.subscribe(handler);
    emit(PANEL_IPC_CHANNEL, READY);
    expect(handler).toHaveBeenCalledWith(READY);
  });

  it("ignores other IPC channels and invalid payloads", () => {
    const { bridge, emit } = setup();
    const handler = vi.fn();
    bridge.subscribe(handler);
    emit("some-other-channel", READY);
    emit(PANEL_IPC_CHANNEL, { type: "ready" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("posts via webview.send on the panel channel", () => {
    const { bridge, webview } = setup();
    bridge.post(FOCUS);
    expect(webview.send).toHaveBeenCalledWith(PANEL_IPC_CHANNEL, FOCUS);
  });
});

describe("createWebviewGuestBridge", () => {
  it("relays valid host messages and sends to host", () => {
    let hostHandler: ((m: PanelMessage) => void) | null = null;
    const off = vi.fn();
    const api = {
      sendToHost: vi.fn(),
      onHostMessage: vi.fn((h: (m: PanelMessage) => void) => {
        hostHandler = h;
        return off;
      }),
    };
    const bridge = createWebviewGuestBridge(api);
    const handler = vi.fn();
    bridge.subscribe(handler);
    hostHandler!(FOCUS);
    expect(handler).toHaveBeenCalledWith(FOCUS);

    bridge.post(READY);
    expect(api.sendToHost).toHaveBeenCalledWith(READY);

    bridge.dispose();
    expect(off).toHaveBeenCalled();
  });
});
