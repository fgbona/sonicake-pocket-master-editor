'use client';

import { useId } from 'react';

/**
 * A small LED in the preset bar that stands for a notice (the Matribox support is experimental):
 * hovering or focusing it shows the full text in a tooltip, which is also the LED's description.
 */
export function StatusLed({ label, text }: { label: string; text: string }) {
  const id = useId();
  return (
    <span className="ws-status-led">
      <button type="button" className="ws-status-led-button" aria-label={label} aria-describedby={id}>
        <span className="ws-status-led-dot" aria-hidden="true" />
      </button>
      <span role="tooltip" id={id} className="ws-status-led-tip">
        {text}
      </span>
    </span>
  );
}
