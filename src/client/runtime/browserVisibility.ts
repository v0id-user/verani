/**
 * Environment-aware Page Visibility API wrapper
 * Detects when browser tab becomes visible/invisible and provides callbacks
 */

/**
 * Type guard to check if we're in a browser environment with document API
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
 * Gets the document object if in browser environment
 */
function getDocument(): { hidden: boolean; addEventListener: (type: string, handler: () => void) => void; removeEventListener: (type: string, handler: () => void) => void } | null {
  if (isBrowserEnvironment() && "document" in globalThis) {
    return (globalThis as any).document;
  }
  return null;
}

/**
 * Gets the current visibility state
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
 * Gets the current page visibility state
 */
export function getVisibilityState(): boolean {
  return isPageVisible();
}

