'use client';

import { useEffect, useRef } from 'react';

export interface EqNodeProps {
  /** "L", "1".."4", "H": the text in the ring. */
  tag: string;
  label: string;
  /** The slider's value, its range and its spoken text. */
  value: number;
  min: number;
  max: number;
  valueText: string;
  /** Position in the graph's own units (percent of its width and height). */
  left: number;
  top: number;
  selected: boolean;
  disabled: boolean;
  describedBy: string;
  onSelect: () => void;
  /** The pointer moved (screen pixels) since the press; `start` is read once, at the press. */
  onDrag: (dx: number, dy: number) => void;
  onDragStart: () => void;
  /** The wheel turned: +1 up, -1 down; `shift` for the secondary value (Q). */
  onWheel: (dir: 1 | -1, shift: boolean) => void;
  onReset: () => void;
  /** Handles the key and returns true, or returns false to leave it. */
  onKey: (e: React.KeyboardEvent) => boolean;
}

/** A node of the EQ graph: a ring that is a slider for the keyboard, a drag handle for the pointer. */
export function EqNode(p: EqNodeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const latest = useRef(p);
  latest.current = p;

  // A wheel listener must be non-passive to keep the page from scrolling under the node.
  useEffect(() => {
    const el = ref.current;
    if (!el || p.disabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY || e.deltaX; // Shift+wheel arrives as a horizontal delta in some browsers
      if (delta !== 0) latest.current.onWheel(delta < 0 ? 1 : -1, e.shiftKey);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [p.disabled]);

  return (
    <div
      ref={ref}
      className={`eq-node${p.selected ? ' is-selected' : ''}`}
      style={{ left: `${p.left}%`, top: `${p.top}%` }}
      role="slider"
      tabIndex={p.disabled ? -1 : 0}
      aria-label={p.label}
      aria-describedby={p.describedBy}
      aria-valuemin={p.min}
      aria-valuemax={p.max}
      aria-valuenow={p.value}
      aria-valuetext={p.valueText}
      aria-disabled={p.disabled}
      onFocus={p.onSelect}
      onPointerDown={(e) => {
        if (p.disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.focus();
        p.onSelect();
        p.onDragStart();
        start.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (s) p.onDrag(e.clientX - s.x, e.clientY - s.y);
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      onDoubleClick={() => !p.disabled && p.onReset()}
      onKeyDown={(e) => {
        if (!p.disabled && p.onKey(e)) e.preventDefault();
      }}
    >
      <span aria-hidden="true">{p.tag}</span>
    </div>
  );
}
