'use client';

import { type KeyboardEvent, type ReactNode, useRef } from 'react';
import type { MessageKey } from '@/lib/i18n';
import { useI18n } from '../I18n';

export interface DockTab {
  /** The tab panel's id (`ws-clones`); its tab is `${id}-tab`. */
  readonly id: string;
  readonly label: MessageKey;
  readonly content: ReactNode;
}

interface Props {
  tabs: readonly DockTab[];
  /** The open tab; null while the dock is folded. */
  active: string | null;
  onActive: (id: string | null) => void;
}

/**
 * The workstation's bottom dock: real tabs (Assistant, Clones & IRs, Controls…) under the chain and
 * the block panel. Clicking the open tab, or the fold button, folds the dock. Below 1280 px the
 * tabs hide and every panel shows stacked (app/workstation.css), so nothing is out of reach there.
 * Panels stay mounted while hidden: an upload or a chat keeps running on another tab.
 */
export function Dock({ tabs, active, onActive }: Props) {
  const { t } = useI18n();
  const list = useRef<HTMLDivElement>(null);
  // Arrow keys move between the tabs (the ARIA tabs pattern), opening the one they land on.
  const onKey = (e: KeyboardEvent, index: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length] as DockTab;
    onActive(next.id);
    list.current?.querySelector<HTMLElement>(`#${next.id}-tab`)?.focus();
  };
  return (
    <section className={`ws-dock${active ? ' is-open' : ''}`} aria-label={t('ws.dock')}>
      <div className="ws-dock-bar">
        <div className="ws-dock-tabs" role="tablist" aria-label={t('ws.dock')} ref={list}>
          {tabs.map((tab, i) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${tab.id}-tab`}
              aria-selected={active === tab.id}
              aria-controls={tab.id}
              tabIndex={active === tab.id || (active === null && i === 0) ? 0 : -1}
              onClick={() => onActive(active === tab.id ? null : tab.id)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {t(tab.label)}
            </button>
          ))}
        </div>
        <button type="button" className="ws-dock-fold" aria-expanded={active !== null} onClick={() => onActive(active ? null : (tabs[0]?.id ?? null))}>
          {t(active ? 'ws.dockFold' : 'ws.dockOpen')}
        </button>
      </div>
      {tabs.map((tab) => (
        <div key={tab.id} role="tabpanel" id={tab.id} aria-labelledby={`${tab.id}-tab`} className={`ws-dock-panel${active === tab.id ? ' is-active' : ''}`}>
          {tab.content}
        </div>
      ))}
    </section>
  );
}
