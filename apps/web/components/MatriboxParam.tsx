'use client';

import { mbFormatValue, type MbParam, type MbResolvedParam } from '@pocket-master/core';
import { mbControl, mbSteps } from '@/lib/matriboxLook';
import { Knob } from './Knob';
import { useI18n } from './I18n';
import { DirtyMark } from './workstation/DirtyMark';

interface Props {
  param: MbResolvedParam;
  /** The catalog's parameter: its step, default and the labels of a list's steps. */
  spec: MbParam | undefined;
  disabled: boolean;
  /** The value differs from what the unit stores. */
  dirty?: boolean;
  onChange: (value: number) => void;
}

const round = (n: number) => String(Number(n.toFixed(2)));

/**
 * One parameter of a Matribox block, by its catalog range: a switch (0..1), a small selector (a
 * few whole steps, e.g. Mode 0..3) or a knob. Values are the unit's own numbers; a knob whose
 * range is not 0..100 says it under its name.
 */
export function MatriboxParam({ param, spec, disabled, dirty = false, onChange }: Props) {
  const { t } = useI18n();
  const range = { min: param.min, max: param.max, step: spec?.step ?? 1 };
  // A value the unit never set reads as not a number: shown as the minimum.
  const value = Number.isFinite(param.value) ? param.value : param.min;
  const kind = mbControl(range);

  if (kind === 'switch') {
    const on = value >= 0.5;
    return (
      <div className={`editor-toggle${dirty ? ' is-dirty' : ''}`}>
        {dirty && <DirtyMark />}
        <span className="knob-value" aria-hidden="true">
          {on ? t('block.on') : t('block.off')}
        </span>
        <button type="button" role="switch" aria-checked={on} aria-label={param.name} className={`switch${on ? ' switch-on' : ''}`} disabled={disabled} onClick={() => onChange(on ? 0 : 1)}>
          <span className="switch-knob" />
        </button>
        <span className="knob-label">{param.name}</span>
      </div>
    );
  }
  if (kind === 'select') {
    const steps = mbSteps(range);
    return (
      <div className={`editor-toggle${dirty ? ' is-dirty' : ''}`}>
        {dirty && <DirtyMark />}
        <span className="knob-value" aria-hidden="true">
          {spec?.options?.[steps.indexOf(value)] ?? round(value)}
        </span>
        <select
          className="param-select"
          aria-label={param.name}
          value={steps.includes(value) ? value : ''}
          disabled={disabled}
          onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))}
        >
          {!steps.includes(value) && <option value="">{round(value)}</option>}
          {steps.map((step, i) => (
            <option key={step} value={step}>
              {spec?.options?.[i] ?? round(step)}
            </option>
          ))}
        </select>
        <span className="knob-label">{param.name}</span>
      </div>
    );
  }
  const percent = param.min === 0 && param.max === 100;
  return (
    <Knob
      label={param.name}
      value={value}
      min={param.min}
      max={param.max}
      step={range.step > 0 ? range.step : 1}
      display={mbFormatValue(value, spec ?? {})}
      defaultValue={spec?.defaultValue}
      hint={percent ? undefined : `${round(param.min)} … ${round(param.max)}${spec?.unit ? ` ${spec.unit}` : ''}`}
      disabled={disabled}
      dirty={dirty}
      onChange={onChange}
    />
  );
}
