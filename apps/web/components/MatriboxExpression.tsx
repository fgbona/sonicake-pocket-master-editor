'use client';

import { useState } from 'react';
import type { MbExpressionAssignment, MbExpressionEntry, MbResolvedBlock } from '@pocket-master/core';
import type { MessageKey } from '@/lib/i18n';
import { Fold } from './Fold';
import { useI18n } from './I18n';
import { sweepRange } from '@/lib/blockViz';

const round = (n: number) => Number(n.toFixed(2));
/** Entries a pedal mode holds. */
const GROUP_SIZE = 3;
/** The nine entries in the unit's order: EXP 1 mode A, EXP 1 mode B, EXP 2. */
const GROUPS: readonly MessageKey[] = ['mb.exp1A', 'mb.exp1B', 'mb.exp2'];

interface Props {
  expression: readonly MbExpressionEntry[];
  chain: readonly MbResolvedBlock[];
  disabled: boolean;
  onExpression: (assignment: MbExpressionAssignment) => void;
  onClear: (entry: number) => void;
}

/** The nine expression-pedal entries, three a pedal mode; folded away until asked for. */
export function MatriboxExpression({ expression, chain, disabled, onExpression, onClear }: Props) {
  const { t } = useI18n();
  const used = expression.filter((e) => e.slot !== null).length;
  return (
    <Fold title={t('mb.expression')} note={t('mb.expUsed', { used, total: expression.length })} open={false}>
      <div className="mb-body">
        <p className="muted small">{t('mb.expressionHint')}</p>
        <div className="mb-exp-groups">
          {GROUPS.map((title, group) => (
            <fieldset key={title} className="mb-exp-group">
              <legend>{t(title)}</legend>
              <ul className="mb-exp">
                {expression.slice(group * GROUP_SIZE, (group + 1) * GROUP_SIZE).map((e) => (
                  <ExpressionRow key={`${e.entry}:${e.slot}:${e.paramId}:${e.min}:${e.max}`} entry={e} chain={chain} disabled={disabled} onApply={onExpression} onClear={onClear} />
                ))}
              </ul>
            </fieldset>
          ))}
        </div>
      </div>
    </Fold>
  );
}

/** One entry: block, parameter, heel (min) and toe (max), sent together with Apply. */
function ExpressionRow({
  entry,
  chain,
  disabled,
  onApply,
  onClear,
}: {
  entry: MbExpressionEntry;
  chain: readonly MbResolvedBlock[];
  disabled: boolean;
  onApply: (a: MbExpressionAssignment) => void;
  onClear: (entry: number) => void;
}) {
  const { t } = useI18n();
  const [slot, setSlot] = useState<number | null>(entry.slot);
  const [paramId, setParamId] = useState(entry.paramId);
  const [min, setMin] = useState(round(entry.min));
  const [max, setMax] = useState(round(entry.max));
  const block = chain.find((b) => b.slot === slot);
  const params = block?.model?.params ?? [];
  const inRange = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
  // "Unused" applies too when the entry holds a block, clearing it.
  const ready = slot === null ? entry.slot !== null : params.some((p) => p.id === paramId) && inRange(min) && inRange(max);
  const n = entry.entry + 1;
  return (
    <li className="mb-exp-row">
      <span className="sidebar-badge">{n}</span>
      <select
        className="param-select"
        aria-label={t('mb.expBlock', { n })}
        value={slot ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value === '' ? null : Number(e.target.value);
          setSlot(next);
          setParamId(chain.find((b) => b.slot === next)?.model?.params[0]?.id ?? 0);
        }}
      >
        <option value="">{t('mb.expNone')}</option>
        {chain.map((b) => (
          <option key={b.slot} value={b.slot}>
            {b.position}. {b.module}
            {b.model ? ` ${b.model.name}` : ''}
          </option>
        ))}
      </select>
      <select className="param-select" aria-label={t('mb.expParam', { n })} value={paramId} disabled={disabled || params.length === 0} onChange={(e) => setParamId(Number(e.target.value))}>
        {params.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <label className="mb-control">
        <span>{t('mb.expMin')}</span>
        <input
          className="bpm-input mb-number"
          type="number"
          min={0}
          max={100}
          value={min}
          disabled={disabled}
          aria-label={t('mb.expMinAria', { n })}
          onChange={(e) => setMin(Number(e.target.value))}
        />
      </label>
      <label className="mb-control">
        <span>{t('mb.expMax')}</span>
        <input
          className="bpm-input mb-number"
          type="number"
          min={0}
          max={100}
          value={max}
          disabled={disabled}
          aria-label={t('mb.expMaxAria', { n })}
          onChange={(e) => setMax(Number(e.target.value))}
        />
      </label>
      <button type="button" className="btn btn-small" disabled={disabled || !ready} onClick={() => (slot === null ? onClear(entry.entry) : onApply({ entry: entry.entry, slot, paramId, min, max }))}>
        {t('mb.expApply')}
      </button>
      <span className="viz-sweep" aria-hidden="true">
        <span className="viz-sweep-range" style={{ left: `${sweepRange(min, max)[0] * 100}%`, width: `${(sweepRange(min, max)[1] - sweepRange(min, max)[0]) * 100}%` }} />
      </span>
    </li>
  );
}
