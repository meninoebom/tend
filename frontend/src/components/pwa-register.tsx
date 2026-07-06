"use client";

import { useEffect } from "react";

/** Registers the minimal service worker so Tend is installable as a PWA. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  }, []);
  return null;
}
