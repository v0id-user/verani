import type { DocumentLike } from "../types";

/**
 * Environment-aware Page Visibility API wrapper.
 * Detects when browser tab becomes visible/invisible and provides callbacks.
 * Works in browser environments and gracefully handles non-browser environments.
 */

/**
 * Type guard to check if we're in a browser environment with document API.
 *
 * @returns True if running in a browser environment with Page Visibility API support
 */
function isBrowserEnvironment(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    "document" in globalThis &&
    typeof (globalThis as any).document !== "undefined" &&
    typeof (globalThis as any).document.hidden !== "undefined" &&
    typeof (globalThis as any).document.addEventListener === "function"
  );
}

/**
 * Gets the document object if in browser environment.
 *
 * @returns Document object if in browser, null otherwise
 */
function getDocument(): DocumentLike | null {
  if (isBrowserEnvironment() && "document" in globalThis) {
    return (globalThis as any).document;
  }
  return null;
}

/**
 * Gets the current visibility state.
 * In non-browser environments, assumes the page is always visible.
 *
 * @returns True if the page is visible, false if hidden
 */
function isPageVisible(): boolean {
  const doc = getDocument();
  if (!doc) {
    // In non-browser environments, assume always visible
    return true;
  }
  return !doc.hidden;
}

/**
 * Sets up a visibility change listener
 * @param callback - Called when visibility changes, receives true if page is visible
 * @returns Cleanup function to remove the listener
 */
export function onVisibilityChange(callback: (isVisible: boolean) => void): (() => void) | null {
  const doc = getDocument();
  if (!doc) {
    console.debug("[Verani:BrowserVisibility] Not in browser environment, skipping visibility listener");
    return null;
  }

  const handler = () => {
    const visible = isPageVisible();
    console.debug("[Verani:BrowserVisibility] Visibility changed, visible:", visible);
    callback(visible);
  };

  // Use the standard Page Visibility API
  doc.addEventListener("visibilitychange", handler);

  console.debug("[Verani:BrowserVisibility] Visibility change listener attached");

  // Return cleanup function
  return () => {
    doc.removeEventListener("visibilitychange", handler);
    console.debug("[Verani:BrowserVisibility] Visibility change listener removed");
  };
}

/**
 * Gets the current page visibility state.
 * Public API for checking if the browser tab is currently visible.
 *
 * @returns True if the page is visible, false if hidden (or true in non-browser environments)
 */
export function getVisibilityState(): boolean {
  return isPageVisible();
}

