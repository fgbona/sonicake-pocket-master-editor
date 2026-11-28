import type { MbParam } from './catalog.ts';

const round = (n: number) => String(Number(n.toFixed(2)));

/**
 * A parameter's value as the knob shows it: "400 ms", "1.2 kHz", "50 %", or just the rounded
 * number (2 decimals at most) when the parameter has no unit. A frequency from 1000 Hz up reads
 * in kHz, to 3 significant decimals at most.
 */
export function mbFormatValue(value: number, param: Pick<MbParam, 'unit'>): string {
  const { unit } = param;
  if (!unit) return round(value);
  if (unit === 'Hz' && Math.abs(value) >= 1000) return `${Number((value / 1000).toFixed(2))} kHz`;
  return `${round(value)} ${unit}`;
}
