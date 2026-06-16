"use client";

import { useEffect, useRef } from "react";
import { useToast, Button } from "@kinetiks/ui";
import { getDesktopBridge } from "@/lib/desktop/useIsDesktop";

/**
 * Surfaces a downloaded desktop update (spec §16.2). The update installs
 * automatically on the next quit; this offers an opt-in "Restart now". Renders
 * nothing and no-ops outside the desktop shell.
 */
export function DesktopUpdateToast() {
  const { push } = useToast();
  const announced = useRef(false);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge) return;

    return bridge.onUpdateStatus((status) => {
      if (status.phase !== "downloaded" || announced.current) return;
      announced.current = true;
      push({
        title: "Update ready",
        body: (
          <span>
            Kinetiks {status.version} is ready.{" "}
            <Button variant="secondary" size="sm" onClick={() => bridge.applyUpdate()}>
              Restart now
            </Button>{" "}
            — or it applies next time you quit.
          </span>
        ),
        tone: "neutral",
        duration: 0,
      });
    });
  }, [push]);

  return null;
}
