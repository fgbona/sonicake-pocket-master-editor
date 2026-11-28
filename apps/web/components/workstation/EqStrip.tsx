'use client';

import type { MbEqBand, MbGlobalEq } from '@pocket-master/core';
import { MB_HIGH_CUT_OFF_HZ, MB_LOW_CUT_OFF_HZ } from '@pocket-master/core';
import { useI18n } from '../I18n';
import { Knob } from '../Knob';

export const GAIN_MAX = 20;
export const Q_MIN = 0.1;
export const Q_MAX = 10;

/** 250 -> "250 Hz", 1200 -> "1.2 kHz". */
export const hzText = (hz: number) => (hz >= 1000 ? `${Math.round(hz / 10) / 100} kHz` : `${Math.round(hz)} Hz`);
export const dbText = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10} dB`;

interface Props {
  eq: MbGlobalEq;
  selected: number;
  disabled: boolean;
  onFrequency: (target: number | 'lowCut' | 'highCut', hz: number) => void;
  onQ: (band: number, q: number) => void;
  onGain: (band: number, v: number) => void;
}

/** The hardware table under the graph: a column per filter, rows Freq / Q / Gain. */
export function EqStrip({ eq, selected, disabled, onFrequency, onQ, onGain }: Props) {
  const { t } = useI18n();
  const cutText = (b: MbEqBand, offAt: number) => (b.on && b.frequency !== offAt ? hzText(b.frequency) : t('mbGlobal.cutOff'));
  const cell = (key: string, node: React.ReactNode) => (
    <div key={key} className="eq-cell">
      {node}
    </div>
  );
  const head = (key: string, text: string, on: boolean) => (
    <div key={key} className={`eq-head${on ? ' is-selected' : ''}`} aria-hidden="true">
      {text}
    </div>
  );
  const bands = eq.bands.map((b, i) => ({ b, i, n: i + 1 }));
  const rowLabel = (text: string) => (
    <div className="eq-rowlabel" aria-hidden="true">
      {text}
    </div>
  );
  return (
    <div className="eq-strip" role="group" aria-label={t('eq.table')}>
      <div className="eq-corner" aria-hidden="true" />
      {head('lo', t('eq.loCut'), false)}
      {bands.map(({ i, n }) => head(`h${n}`, t('eq.band', { n }), i === selected))}
      {head('hi', t('eq.hiCut'), false)}

      {rowLabel(t('eq.rowFreq'))}
      {cell(
        'lo-f',
        <Knob
          label={t('eq.lowCutFreq')}
          value={eq.lowCut.on ? eq.lowCut.frequency : MB_LOW_CUT_OFF_HZ}
          min={MB_LOW_CUT_OFF_HZ}
          max={1000}
          display={cutText(eq.lowCut, MB_LOW_CUT_OFF_HZ)}
          defaultValue={MB_LOW_CUT_OFF_HZ}
          disabled={disabled}
          onChange={(v) => onFrequency('lowCut', v)}
        />,
      )}
      {bands.map(({ b, i, n }) =>
        cell(`f${n}`, <Knob label={t('eq.bandFreq', { n })} value={b.frequency} min={20} max={20000} display={hzText(b.frequency)} disabled={disabled} onChange={(v) => onFrequency(i, v)} />),
      )}
      {cell(
        'hi-f',
        <Knob
          label={t('eq.highCutFreq')}
          value={eq.highCut.on ? eq.highCut.frequency : MB_HIGH_CUT_OFF_HZ}
          min={1000}
          max={MB_HIGH_CUT_OFF_HZ}
          display={cutText(eq.highCut, MB_HIGH_CUT_OFF_HZ)}
          defaultValue={MB_HIGH_CUT_OFF_HZ}
          disabled={disabled}
          onChange={(v) => onFrequency('highCut', v)}
        />,
      )}

      {rowLabel('Q')}
      {cell('lo-q', null)}
      {bands.map(({ b, i, n }) =>
        cell(`q${n}`, <Knob label={t('eq.bandQ', { n })} value={b.q} min={Q_MIN} max={Q_MAX} step={0.1} display={b.q.toFixed(2)} disabled={disabled} onChange={(v) => onQ(i, v)} />),
      )}
      {cell('hi-q', null)}

      {rowLabel(t('eq.rowGain'))}
      {cell('lo-g', null)}
      {bands.map(({ b, i, n }) =>
        cell(
          `g${n}`,
          <Knob label={t('eq.bandGain', { n })} value={b.gain} min={-GAIN_MAX} max={GAIN_MAX} display={dbText(b.gain)} defaultValue={0} disabled={disabled} onChange={(v) => onGain(i, v)} />,
        ),
      )}
      {cell('hi-g', null)}
    </div>
  );
}
