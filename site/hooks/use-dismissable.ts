"use client";

import { useEffect, useRef } from "react";

/**
 * Closes a menu or popover the way everything else on the page does: a pointer
 * down anywhere outside it, or Escape.
 *
 * `boundary` is a selector marking what counts as inside — a data attribute on
 * the wrapper, so the trigger and the panel can be separate elements without
 * the hook needing a ref to each. `onEscape` runs before the close and is where
 * focus goes back to the trigger; a pointer down elsewhere has already moved
 * focus itself, so it is deliberately not called then.
 *
 * The callbacks are held in refs, so an inline arrow function does not
 * resubscribe both listeners on every render.
 */
export function useDismissable(open: boolean, boundary: string, onDismiss: () => void, onEscape?: () => void) {
  const dismissRef = useRef(onDismiss);
  const escapeRef = useRef(onEscape);
  useEffect(() => { dismissRef.current = onDismiss; escapeRef.current = onEscape; }, [onDismiss, onEscape]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(boundary)) dismissRef.current();
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      escapeRef.current?.();
      dismissRef.current();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open, boundary]);
}
