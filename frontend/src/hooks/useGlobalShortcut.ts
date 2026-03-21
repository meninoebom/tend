import { useEffect } from "react";

/**
 * Registers a global keyboard shortcut that only fires when no
 * input, textarea, or contenteditable element is focused.
 */
export function useGlobalShortcut(key: string, callback: () => void) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== key) return;

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      e.preventDefault();
      callback();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [key, callback]);
}
