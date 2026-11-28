'use client';

import { memo, useId, useRef, useState } from 'react';
import { MB_HIGH_CUT_OFF_HZ, MB_LOW_CUT_OFF_HZ, type MbEqBand, type MbGlobalEq } from '@pocket-master/core';
import { EQ_MAX_HZ, EQ_MIN_HZ, type EqSpec, eqBiquads, eqCurve, eqResponseOf } from '@/lib/eqCurve';
import { Knob } from '../Knob';
import { useI18n } from '../I18n';
import { EqNode } from './EqNode';
import { dbText, EqStrip, GAIN_MAX, hzText, Q_MAX, Q_MIN } from './EqStrip';

const W = 600;
const H = 260;
const PAD = { l: 38, r: 14, t: 12, b: 24 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;
const DB_AXIS = 25;
const FREQ_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const DB_TICKS = [-20, -10, 0, 10, 20];
const DECADES = Math.log10(EQ_MAX_HZ / EQ_MIN_HZ);
const SEMITONE = 2 ** (1 / 12);
const Q_STEP = 0.1;
/** The frequency ranges a filter can be set to. */
const RANGES = { band: [20, 20000], lowCut: [20, 1000], highCut: [1000, 20000] } as const;

type Target = number | 'lowCut' | 'highCut';

const clamp = (v: number, [min, max]: readonly [number, number] | readonly number[]) => Math.min(max as number, Math.max(min as number, v));
const xOf = (f: number) => PAD.l + (Math.log10(f / EQ_MIN_HZ) / DECADES) * PLOT_W;
const yOf = (db: number) => PAD.t + ((DB_AXIS - clamp(db, [-DB_AXIS, DB_AXIS])) / (2 * DB_AXIS)) * PLOT_H;
const freqLabel = (f: number) => (f >= 1000 ? `${f / 1000}k` : String(f));
const round1 = (n: number) => Math.round(n * 10) / 10;
const rangeOf = (target: Target) => (typeof target === 'number' ? RANGES.band : RANGES[target]);

/** The spec the curve is drawn from: a cut that is off (or at its off frequency) is left out. */
function specOf(eq: MbGlobalEq): EqSpec {
  const cut = (b: MbEqBand, offAt: number) => (b.on && b.frequency !== offAt ? { frequency: b.frequency, q: b.q } : null);
  return {
    bands: eq.bands.map((b) => ({ frequency: b.frequency, q: b.q, gain: b.gain, on: b.on })),
    lowCut: cut(eq.lowCut, MB_LOW_CUT_OFF_HZ),
    highCut: cut(eq.highCut, MB_HIGH_CUT_OFF_HZ),
  };
}

const curvePath = (spec: EqSpec) =>
  eqCurve(spec)
    .map(({ f, db }, i) => `${i ? 'L' : 'M'}${round1(xOf(f))} ${round1(yOf(db))}`)
    .join('');

/** One semitone (or a third of an octave with `big`) up or down, at least 1 Hz. */
function stepFrequency(hz: number, dir: 1 | -1, big: boolean) {
  const next = Math.round(hz * (big ? 2 ** (dir / 3) : SEMITONE ** dir));
  return next === Math.round(hz) ? Math.round(hz) + dir : next;
}

function Grid() {
  return (
    <g className="eq-grid">
      {FREQ_TICKS.map((f) => (
        <g key={f}>
          <line x1={xOf(f)} x2={xOf(f)} y1={PAD.t} y2={PAD.t + PLOT_H} />
          <text x={xOf(f)} y={H - 7} textAnchor="middle">
            {freqLabel(f)}
          </text>
        </g>
      ))}
      {DB_TICKS.map((db) => (
        <g key={db} className={db === 0 ? 'eq-zero' : undefined}>
          <line x1={PAD.l} x2={PAD.l + PLOT_W} y1={yOf(db)} y2={yOf(db)} />
          <text x={PAD.l - 6} y={yOf(db) + 4} textAnchor="end">
            {db > 0 ? `+${db}` : db}
          </text>
        </g>
      ))}
    </g>
  );
}

interface Props {
  eq: MbGlobalEq;
  eqOn: boolean;
  disabled: boolean;
  onOn: (on: boolean) => void;
  onLevel: (v: number) => void;
  onGain: (band: number, v: number) => void;
  onFrequency: (target: Target, hz: number) => void;
  onQ: (band: number, q: number) => void;
}

/** What a node holds when a drag starts. */
interface Snapshot {
  frequency: number;
  gain: number;
}

/** The global EQ as the unit shows it: the response graph with nodes L, 1..4, H, ON/OFF and Level, and the table under it. */
function EqGraphView({ eq, eqOn, disabled, onOn, onLevel, onGain, onFrequency, onQ }: Props) {
  const { t } = useI18n();
  const clip = useId();
  const hint = useId();
  const [selected, setSelected] = useState(0);
  const plot = useRef<HTMLDivElement>(null);
  const snap = useRef<Snapshot>({ frequency: 0, gain: 0 });
  const spec = specOf(eq);
  const filters = eqBiquads(spec);
  const plotPx = () => plot.current?.getBoundingClientRect() ?? { width: W, height: H };
  // Screen pixels per decade and per dB, so a drag follows the pointer whatever the graph's size.
  const pxPerDecade = () => (plotPx().width * (PLOT_W / W)) / DECADES;
  const pxPerDb = () => (plotPx().height * (PLOT_H / H)) / (2 * DB_AXIS);

  const frequencyOf = (target: Target) => (typeof target === 'number' ? eq.bands[target]!.frequency : eq[target].frequency);
  const setFrequency = (target: Target, hz: number) => {
    // A cut dragged or typed to its end of the scale is off.
    const off = target === 'lowCut' ? (hz < 20 ? MB_LOW_CUT_OFF_HZ : null) : target === 'highCut' ? (hz > 20000 ? MB_HIGH_CUT_OFF_HZ : null) : null;
    const next = off ?? Math.round(clamp(hz, rangeOf(target)));
    if (next !== frequencyOf(target)) onFrequency(target, next);
  };
  const setGain = (band: number, v: number) => {
    const next = Math.round(clamp(v, [-GAIN_MAX, GAIN_MAX]));
    if (next !== eq.bands[band]!.gain) onGain(band, next);
  };
  const setQ = (band: number, q: number) => {
    const next = Math.round(clamp(q, [Q_MIN, Q_MAX]) * 100) / 100;
    if (next !== eq.bands[band]!.q) onQ(band, next);
  };

  const bandNode = (i: number) => {
    const b = eq.bands[i]!;
    return (
      <EqNode
        key={`band${i + 1}`}
        tag={String(i + 1)}
        label={t('mbGlobal.band', { n: i + 1, freq: hzText(b.frequency) })}
        value={b.gain}
        min={-GAIN_MAX}
        max={GAIN_MAX}
        valueText={dbText(b.gain)}
        left={(xOf(b.frequency) / W) * 100}
        top={(yOf(eqResponseOf(filters, b.frequency)) / H) * 100}
        selected={selected === i}
        disabled={disabled}
        describedBy={hint}
        onSelect={() => setSelected(i)}
        onDragStart={() => {
          snap.current = { frequency: b.frequency, gain: b.gain };
        }}
        onDrag={(dx, dy) => {
          setFrequency(i, snap.current.frequency * 10 ** (dx / pxPerDecade()));
          setGain(i, snap.current.gain - dy / pxPerDb());
        }}
        onWheel={(dir, shift) => (shift ? setQ(i, b.q + dir * Q_STEP) : setGain(i, b.gain + dir))}
        onReset={() => setGain(i, 0)}
        onKey={(e) => {
          const dir = e.key === 'ArrowUp' || e.key === 'PageUp' ? 1 : e.key === 'ArrowDown' || e.key === 'PageDown' ? -1 : 0;
          if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) setQ(i, b.q + dir * Q_STEP);
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') setGain(i, b.gain + dir);
          else if (e.key === 'PageUp' || e.key === 'PageDown') setGain(i, b.gain + dir * 5);
          else if (e.key === 'Home') setGain(i, -GAIN_MAX);
          else if (e.key === 'End') setGain(i, GAIN_MAX);
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') setFrequency(i, stepFrequency(b.frequency, e.key === 'ArrowRight' ? 1 : -1, e.shiftKey));
          else return false;
          return true;
        }}
      />
    );
  };

  const cutNode = (target: 'lowCut' | 'highCut') => {
    const b = eq[target];
    const low = target === 'lowCut';
    const offAt = low ? MB_LOW_CUT_OFF_HZ : MB_HIGH_CUT_OFF_HZ;
    const isOff = !b.on || b.frequency === offAt;
    const [min, max] = RANGES[target];
    const shown = isOff ? (low ? EQ_MIN_HZ : EQ_MAX_HZ) : b.frequency;
    const label = t('eq.cutNode', { name: low ? t('eq.loCut') : t('eq.hiCut'), freq: isOff ? t('mbGlobal.cutOff') : hzText(b.frequency) });
    const move = (hz: number) => setFrequency(target, hz);
    return (
      <EqNode
        key={target}
        tag={low ? 'L' : 'H'}
        label={label}
        value={isOff ? offAt : b.frequency}
        min={low ? offAt : min}
        max={low ? max : offAt}
        valueText={isOff ? t('mbGlobal.cutOff') : hzText(b.frequency)}
        left={(xOf(shown) / W) * 100}
        top={(yOf(eqResponseOf(filters, shown)) / H) * 100}
        selected={false}
        disabled={disabled}
        describedBy={hint}
        onSelect={() => undefined}
        onDragStart={() => {
          snap.current = { frequency: shown, gain: 0 };
        }}
        onDrag={(dx) => move(snap.current.frequency * 10 ** (dx / pxPerDecade()))}
        onWheel={(dir) => move(stepFrequency(shown, dir, false))}
        onReset={() => onFrequency(target, offAt)}
        onKey={(e) => {
          const up = e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp';
          const down = e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown';
          if (up || down) move(stepFrequency(shown, up ? 1 : -1, e.shiftKey || e.key.startsWith('Page')));
          else if (e.key === 'Home') onFrequency(target, low ? offAt : min);
          else if (e.key === 'End') onFrequency(target, low ? max : offAt);
          else return false;
          return true;
        }}
      />
    );
  };

  return (
    <div className={`eq-panel${eqOn ? '' : ' is-bypassed'}`}>
      <div className="eq-plot" ref={plot}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('eq.graph')} className="eq-svg">
          <defs>
            <clipPath id={clip}>
              <rect x={PAD.l} y={PAD.t} width={PLOT_W} height={PLOT_H} />
            </clipPath>
          </defs>
          <Grid />
          <path d={curvePath(spec)} className="eq-curve" clipPath={`url(#${clip})`} />
        </svg>
        {cutNode('lowCut')}
        {eq.bands.map((_, i) => bandNode(i))}
        {cutNode('highCut')}
      </div>
      <p className="eq-hint" id={hint}>
        {t('eq.hint')}
      </p>
      <div className="eq-controls">
        <button type="button" role="switch" aria-checked={eqOn} aria-label={t('mbGlobal.eqOn')} className={`eq-power${eqOn ? ' is-on' : ''}`} disabled={disabled} onClick={() => onOn(!eqOn)}>
          <span className="eq-power-led" aria-hidden="true" />
          <span className="eq-power-text" aria-hidden="true">
            {eqOn ? t('eq.stateOn') : t('eq.stateOff')}
          </span>
        </button>
        <Knob label={t('mbGlobal.eqLevel')} value={eq.level} min={0} max={100} display={String(Math.round(eq.level))} defaultValue={50} disabled={disabled} onChange={onLevel} />
      </div>
      <EqStrip eq={eq} selected={selected} disabled={disabled} onFrequency={setFrequency} onQ={setQ} onGain={setGain} />
    </div>
  );
}

/** Memoised: the unit's knob notices re-render the editor many times a second; the EQ only when its own values change. */
export const EqGraph = memo(EqGraphView);
