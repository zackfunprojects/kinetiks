"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * App-wide keyboard shortcuts (per the design spec):
 *   ⌘/Ctrl + K        toggle the command palette
 *   ⌘/Ctrl + 1/2/3    Chat / Analytics / Cortex
 *   ⌘/Ctrl + Shift+A  jump to Chat (where approvals live)
 */
export function useGlobalShortcuts({ onTogglePalette }: { onTogglePalette: () => void }) {
  const router = useRouter();

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      if (key === "k") {
        e.preventDefault();
        onTogglePalette();
        return;
      }
      if (e.shiftKey && key === "a") {
        e.preventDefault();
        router.push("/chat");
        return;
      }
      if (key === "1") {
        e.preventDefault();
        router.push("/chat");
      } else if (key === "2") {
        e.preventDefault();
        router.push("/analytics");
      } else if (key === "3") {
        e.preventDefault();
        router.push("/cortex/identity");
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router, onTogglePalette]);
}
