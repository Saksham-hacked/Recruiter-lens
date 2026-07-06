// hooks/useDraggable.js
// Lightweight drag-to-reposition for the floating Panel.
// Only starts a drag from elements that aren't buttons (so close/minimize still work).

import { useState, useRef, useCallback } from "react";

const PANEL_WIDTH = 320; // matches w-80
const MARGIN = 8;

export function useDraggable() {
  const [pos, setPos] = useState(() => ({
    x: Math.max(MARGIN, window.innerWidth - PANEL_WIDTH - 20),
    y: 80,
  }));
  const drag = useRef(null);

  const onPointerDown = useCallback((e) => {
    if (e.target.closest("button")) return; // let buttons work normally
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;

    const nextX = Math.min(
      Math.max(drag.current.originX + dx, MARGIN),
      window.innerWidth - PANEL_WIDTH - MARGIN
    );
    const nextY = Math.min(
      Math.max(drag.current.originY + dy, MARGIN),
      window.innerHeight - 60
    );

    setPos({ x: nextX, y: nextY });
  }, []);

  const onPointerUp = useCallback((e) => {
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  }, []);

  return { pos, dragHandlers: { onPointerDown, onPointerMove, onPointerUp } };
}
