import type { DetailedHTMLProps, HTMLAttributes } from "react";

/**
 * `<webview>` is an Electron-only embedder tag (enabled by `webviewTag: true`
 * in the desktop shell). It is only rendered inside the desktop renderer; on
 * the web the panel renders an `<iframe>` instead. Declaring it here lets the
 * `PanelFrame` use it in JSX without pulling Electron types into apps/id.
 *
 * `preload` is intentionally omitted — the main process forces the hardened
 * webview preload + the persist:collaborative partition (will-attach-webview),
 * so the renderer must not (and cannot meaningfully) set them.
 */
declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          src?: string;
        },
        HTMLElement
      >;
    }
  }
}

export {};
