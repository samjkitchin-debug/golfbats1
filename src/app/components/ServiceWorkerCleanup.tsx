"use client";

import { useEffect } from "react";

/**
 * One-time cleanup: unregister all service workers for this origin.
 * TODO: Remove after 48 hours / after confirmation that users are clean.
 * See: SW removal to fix navigation on dayforeit.sg and dev.dayforeit.sg.
 */
export default function ServiceWorkerCleanup() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
    }
  }, []);
  return null;
}
