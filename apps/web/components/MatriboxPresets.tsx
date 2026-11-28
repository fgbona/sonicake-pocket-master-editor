'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { mbPresetLabel, type MbPresetName } from '@pocket-master/core';
import { Dialog } from './Dialog';
import { useI18n } from './I18n';
import { sharedPrefix, slotRole } from '@/lib/workstation/banks';
import { RoleChip } from './workstation/RoleButtons';

interface Props {
  names: readonly MbPresetName[];
  current: number;
  edited: boolean;
  onLoad: (index: number) => void;
}

/** Presets a bank: A, B, C and D. */
const BANK_SIZE = 4;

/**
 * The Matribox's 240 presets by bank (1A..60D) with a search, in the Pocket Master's sidebar;
 * loading asks first over unsaved edits. Never disabled: a load waits in the editor's queue behind
 * whatever runs. At phone width the list folds behind a button showing the loaded preset.
 */
export function MatriboxPresets({ names, current, edited, onLoad }: Props) {
  const { t } = useI18n();
  const [filter, setFilter] = useState('');
  const [pending, setPending] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const banks = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const shown = names.map((p, i) => ({ i, name: p.name, label: mbPresetLabel(i) })).filter((p) => !f || p.name.toLowerCase().includes(f) || p.label.toLowerCase() === f);
    const bankOf = (i: number) => Math.floor(i / BANK_SIZE) + 1;
    return [...new Set(shown.map((p) => bankOf(p.i)))].map((bank) => {
      const presets = shown.filter((p) => bankOf(p.i) === bank);
      return { bank, presets, prefix: sharedPrefix(presets.map((p) => p.name)) };
    });
  }, [names, filter]);

  // The loaded preset in view: the list is long (60 banks). Only the list scrolls, never the page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: current and open are the triggers (another preset loaded, the list unfolded)
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (list && item) list.scrollTop += item.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 2 + item.offsetHeight / 2;
  }, [current, open]);

  const choose = (i: number) => {
    if (i === current) return;
    setOpen(false);
    if (edited) setPending(i);
    else onLoad(i);
  };
  return (
    <aside className={`sidebar mb-sidebar${open ? ' is-open' : ''}`} aria-label={t('presets.title')}>
      <button type="button" className="sidebar-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          {t('presets.title')} · {mbPresetLabel(current)} {names[current]?.name ?? ''}
        </span>
      </button>
      <input className="sidebar-search" type="search" value={filter} placeholder={t('presets.filter')} aria-label={t('presets.filter')} onChange={(e) => setFilter(e.target.value)} />
      <ul className="sidebar-list mb-banks" ref={listRef}>
        {banks.map(({ bank, presets, prefix }) => (
          <li key={bank} className="mb-bank">
            <span className="mb-bank-label" id={`mb-bank-${bank}`}>
              {t('mb.bank', { n: bank })}
              {prefix && <span className="ws-bank-prefix"> · {prefix}</span>}
            </span>
            <ul className="mb-bank-presets" aria-labelledby={`mb-bank-${bank}`}>
              {presets.map((p) => (
                <li key={p.i}>
                  <button
                    type="button"
                    className={`sidebar-item${p.i === current ? ' is-current' : ''}`}
                    aria-current={p.i === current ? 'true' : undefined}
                    aria-label={t('presets.loadAria', { label: p.label, name: p.name })}
                    onClick={() => choose(p.i)}
                  >
                    <span className="sidebar-badge">{p.label}</span>
                    <span className={`sidebar-name${p.name.trim() ? '' : ' muted'}`}>{p.name.trim() || t('mb.unnamed')}</span>
                    <RoleChip role={slotRole(p.i, BANK_SIZE)} />
                    {p.i === current && edited && <span className="ws-dirty-dot" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <Dialog open={pending !== null} title={t('presets.unsavedTitle')} onClose={() => setPending(null)}>
        <p>{t('presets.unsaved', { current: mbPresetLabel(current), next: pending === null ? '' : mbPresetLabel(pending) })}</p>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => setPending(null)}>
            {t('action.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (pending !== null) onLoad(pending);
              setPending(null);
            }}
          >
            {t('presets.discard')}
          </button>
        </div>
      </Dialog>
    </aside>
  );
}
