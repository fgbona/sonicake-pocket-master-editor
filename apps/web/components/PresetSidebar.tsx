'use client';

import { useMemo, useState } from 'react';
import { presetLabel, USER_PRESETS } from '@pocket-master/core';
import { Dialog } from './Dialog';
import { useI18n } from './I18n';
import { sharedPrefix, slotRole } from '@/lib/workstation/banks';
import { RoleChip } from './workstation/RoleButtons';

interface Props {
  names: readonly string[] | null;
  current: number | null;
  modified: boolean;
  disabled: boolean;
  onReadNames: () => void;
  onLoad: (index: number) => void;
}

type Bank = 'user' | 'factory';

/** The workstation's banks of three (CLEAN, RHY, LEAD): P01–P03 is bank 1. */
const BANK_SIZE = 3;

/** Factory / user banks, a search and every preset; loading asks first over unsaved changes. */
export function PresetSidebar({ names, current, modified, disabled, onReadNames, onLoad }: Props) {
  const { t } = useI18n();
  const [bank, setBank] = useState<Bank>(current !== null && current >= USER_PRESETS ? 'factory' : 'user');
  const [filter, setFilter] = useState('');
  const [pending, setPending] = useState<number | null>(null);
  // Phone width only: the list folds behind a button showing the current preset.
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (names ?? [])
      .map((name, i) => ({ i, name, label: presetLabel(i) }))
      .filter((p) => (bank === 'user' ? p.i < USER_PRESETS : p.i >= USER_PRESETS))
      .filter((p) => !f || p.name.toLowerCase().includes(f) || p.label.toLowerCase().includes(f));
  }, [names, filter, bank]);

  const choose = (i: number) => {
    if (i === current) return;
    setOpen(false);
    if (modified) setPending(i);
    else onLoad(i);
  };

  return (
    <aside className={`sidebar${open ? ' is-open' : ''}`} aria-label={t('presets.title')}>
      <button type="button" className="sidebar-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          {t('presets.title')}
          {current !== null ? ` · ${presetLabel(current)} ${names?.[current] ?? ''}` : ''}
        </span>
      </button>
      <div className="segmented sidebar-banks" role="tablist">
        {(['factory', 'user'] as const).map((b) => (
          <button key={b} type="button" role="tab" aria-selected={bank === b} className={bank === b ? 'is-on' : ''} onClick={() => setBank(b)}>
            {t(b === 'user' ? 'presets.user' : 'presets.factory')}
          </button>
        ))}
      </div>
      <input className="sidebar-search" type="search" value={filter} placeholder={t('presets.filter')} aria-label={t('presets.filter')} onChange={(e) => setFilter(e.target.value)} />
      {!names ? (
        <button type="button" className="btn btn-small" disabled={disabled} onClick={onReadNames}>
          {t('presets.read')}
        </button>
      ) : (
        <ul className="sidebar-list mb-banks">
          {banksOf(shown, bank === 'user' ? 0 : USER_PRESETS).map(({ bank: n, presets }) => (
            <li key={n} className="mb-bank">
              <span className="mb-bank-label" id={`pm-bank-${bank}-${n}`}>
                {t('mb.bank', { n })}
                {sharedPrefix(presets.map((p) => p.name)) && <span className="ws-bank-prefix"> · {sharedPrefix(presets.map((p) => p.name))}</span>}
              </span>
              <ul className="mb-bank-presets" aria-labelledby={`pm-bank-${bank}-${n}`}>
                {presets.map((p) => (
                  <li key={p.i}>
                    <button
                      type="button"
                      className={`sidebar-item${p.i === current ? ' is-current' : ''}`}
                      disabled={disabled}
                      aria-current={p.i === current ? 'true' : undefined}
                      aria-label={t('presets.loadAria', { label: p.label, name: p.name })}
                      onClick={() => choose(p.i)}
                    >
                      <span className="sidebar-badge">{p.label}</span>
                      <span className="sidebar-name">{p.name}</span>
                      <RoleChip role={p.i < USER_PRESETS ? slotRole(p.i, BANK_SIZE) : null} />
                      {p.i === current && modified && <span className="ws-dirty-dot" aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={pending !== null} title={t('presets.unsavedTitle')} onClose={() => setPending(null)}>
        <p>{t('presets.unsaved', { current: current === null ? '' : presetLabel(current), next: pending === null ? '' : presetLabel(pending) })}</p>
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

/** The shown presets by bank of three, numbered from the first slot of their list (`first`). */
function banksOf<T extends { readonly i: number }>(presets: readonly T[], first: number) {
  const bankOf = (i: number) => Math.floor((i - first) / BANK_SIZE) + 1;
  return [...new Set(presets.map((p) => bankOf(p.i)))].map((bank) => ({ bank, presets: presets.filter((p) => bankOf(p.i) === bank) }));
}
