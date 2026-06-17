"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  createPostMessageBridge,
  createWebviewHostBridge,
  type PanelBridge,
  type WebviewHostElement,
} from "@kinetiks/collaborative";
import { PANEL_MESSAGE_SOURCE } from "@kinetiks/types";
import { useIsDesktop } from "@/lib/desktop/useIsDesktop";

export interface PanelFrameProps {
  app: string;
  entity?: string;
  mode: "collaborative";
  threadId?: string;
  accountId: string;
  /** Active/partner frames render visibly; cached frames stay mounted but
   *  `display:none` (warm web context, out of layout) per §14.3. */
  visible: boolean;
  /** Flex order for visible frames (active left, partner right) — the DOM order
   *  follows the LRU, so layout order is controlled here. */
  order?: number;
}

function useEmbedSrc(props: Pick<PanelFrameProps, "app" | "entity" | "mode" | "threadId" | "accountId">): string {
  const { app, entity, mode, threadId, accountId } = props;
  return useMemo(() => {
    const params = new URLSearchParams({ mode, account: accountId });
    if (app) params.set("app", app);
    if (entity) params.set("entity", entity);
    if (threadId) params.set("thread", threadId);
    return `/embed?${params.toString()}`;
  }, [app, entity, mode, threadId, accountId]);
}

/**
 * Manage the host side of the shell↔embed coordination bridge for one frame:
 * wait for the guest's `ready`, then push the frame's `visibility` (so a
 * cached/off-screen frame can suspend, §14.3) and keep it in sync.
 */
function usePanelHostBridge(makeBridge: () => PanelBridge | null, visible: boolean): void {
  const bridgeRef = useRef<PanelBridge | null>(null);
  const readyRef = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const makeRef = useRef(makeBridge);
  makeRef.current = makeBridge;

  useEffect(() => {
    const bridge = makeRef.current();
    if (!bridge) return;
    bridgeRef.current = bridge;
    const off = bridge.subscribe((msg) => {
      if (msg.type === "ready") {
        readyRef.current = true;
        bridge.post({ source: PANEL_MESSAGE_SOURCE, type: "visibility", visible: visibleRef.current });
      }
    });
    return () => {
      off();
      bridge.dispose();
      bridgeRef.current = null;
      readyRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (readyRef.current) {
      bridgeRef.current?.post({ source: PANEL_MESSAGE_SOURCE, type: "visibility", visible });
    }
  }, [visible]);
}

/**
 * One embedded app surface. On the desktop shell it is an Electron `<webview>`
 * (its own warm web context, hardened + session-mirrored by the main process);
 * on the web it is a same-origin `<iframe>`. Same `/embed?…` URL, same
 * collaborative components inside — only the host element differs (§4.4).
 */
export function PanelFrame(props: PanelFrameProps) {
  const desktop = useIsDesktop();
  const src = useEmbedSrc(props);

  const wrapperStyle: CSSProperties = {
    display: props.visible ? "block" : "none",
    position: "relative",
    flex: props.visible ? 1 : undefined,
    order: props.order,
    minHeight: 0,
    minWidth: 0,
  };

  return (
    <div style={wrapperStyle} aria-hidden={props.visible ? undefined : true}>
      {desktop ? (
        <WebviewEmbed src={src} app={props.app} visible={props.visible} />
      ) : (
        <IframeEmbed src={src} app={props.app} visible={props.visible} />
      )}
    </div>
  );
}

function Skeleton({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading workspace"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--kt-fg-3)",
        fontSize: "var(--kt-fs-13)",
      }}
    >
      Loading workspace…
    </div>
  );
}

const fillStyle = (loaded: boolean): CSSProperties => ({
  border: "none",
  width: "100%",
  height: "100%",
  display: "block",
  opacity: loaded ? 1 : 0,
  transition: "opacity var(--kt-dur-2) ease",
});

function IframeEmbed({ src, app, visible }: { src: string; app: string; visible: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [src]);

  usePanelHostBridge(
    () =>
      typeof window === "undefined"
        ? null
        : createPostMessageBridge({
            // Read the live contentWindow so a reload (new src) still routes.
            target: { postMessage: (m, o) => ref.current?.contentWindow?.postMessage(m, o) },
            host: window,
            origin: window.location.origin,
          }),
    visible,
  );

  return (
    <>
      <Skeleton shown={!loaded} />
      <iframe ref={ref} src={src} title={`App panel — ${app}`} onLoad={() => setLoaded(true)} style={fillStyle(loaded)} />
    </>
  );
}

/** A `<webview>` ready to relay coordination + report load. The `dom-ready`
 *  event is the webview equivalent of the iframe `load` event. */
function WebviewEmbed({ src, app, visible }: { src: string; app: string; visible: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    const el = ref.current;
    if (!el) return;
    const onReady = () => setLoaded(true);
    el.addEventListener("dom-ready", onReady);
    return () => el.removeEventListener("dom-ready", onReady);
  }, [src]);

  usePanelHostBridge(
    () => (ref.current ? createWebviewHostBridge(ref.current as unknown as WebviewHostElement) : null),
    visible,
  );

  return (
    <>
      <Skeleton shown={!loaded} />
      {/* Popups + window.open are denied by the main process; no allowpopups. */}
      <webview ref={ref} src={src} title={`App panel — ${app}`} style={fillStyle(loaded)} />
    </>
  );
}
