'use client';

import type { ReactNode } from 'react';
import { ModuleIcon } from './ModuleIcon';
import { useI18n } from './I18n';
import { useStripScroll } from './useStripScroll';

interface StripProps {
  /** Values that change the strip's content (its ‹ › buttons are worked out again). */
  deps: readonly unknown[];
  editable: boolean;
  /** The pedals: `li.tile-unit` items. */
  children: ReactNode;
  /** Shown over the strip, outside its scrolling list (a menu opened from a tile). */
  overlay?: ReactNode;
}

/** The signal chain's strip, shared by both pedals' editors: it scrolls sideways by touch, wheel or its ‹ › buttons. */
export function TileStrip({ deps, editable, children, overlay }: StripProps) {
  const { t } = useI18n();
  const strip = useStripScroll<HTMLOListElement>(deps);
  return (
    <div className="tiles-wrap">
      {strip.hidden.start && (
        <button type="button" className="tiles-page tiles-page-start" aria-label={t('chain.scrollStart')} onClick={() => strip.page(-1)}>
          ‹
        </button>
      )}
      <ol ref={strip.ref} className={`tiles${editable ? ' tiles-editable' : ''}`} aria-label={t('chain.aria')}>
        {children}
      </ol>
      {strip.hidden.end && (
        <button type="button" className="tiles-page tiles-page-end" aria-label={t('chain.scrollEnd')} onClick={() => strip.page(1)}>
          ›
        </button>
      )}
      {overlay}
    </div>
  );
}

interface TileProps {
  /** The class that sets the block's tint (`block-amp`, `mb-amp`). */
  tint: string;
  /** The block's drawing (ModuleIcon). */
  icon: string;
  label: string;
  model: string;
  on: boolean;
  selected: boolean;
  editable: boolean;
  selectLabel: string;
  ledLabel: string;
  onSelect: () => void;
  onToggle: () => void;
  /** A gear drawing (RigIcon) in place of the module icon. */
  drawing?: ReactNode;
  /** Its stored values differ from the edit buffer's: the label of the amber dot that says so. */
  dirtyLabel?: string;
}

/** One pedal of the chain: drawing, label, model, and an LED that is its on/off switch. */
export function PedalTile({ tint, icon, label, model, on, selected, editable, selectLabel, ledLabel, onSelect, onToggle, dirtyLabel, drawing }: TileProps) {
  return (
    <div className={`tile ${tint}${on ? '' : ' tile-off'}${selected ? ' tile-selected' : ''}${dirtyLabel ? ' tile-dirty' : ''}`}>
      {dirtyLabel && <span className="tile-dirty-dot" role="img" aria-label={dirtyLabel} title={dirtyLabel} />}
      <button type="button" className="tile-body" aria-pressed={selected} aria-label={selectLabel} onClick={onSelect}>
        {drawing ?? <ModuleIcon blockKey={icon} />}
        <span className="tile-label">{label}</span>
        <span className="tile-model">{model}</span>
      </button>
      <button type="button" className={`tile-led${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={ledLabel} disabled={!editable} onClick={onToggle} />
    </div>
  );
}

interface MoveProps {
  earlierLabel: string;
  laterLabel: string;
  first: boolean;
  last: boolean;
  onEarlier: () => void;
  onLater: () => void;
}

/** The ‹ › pair under a pedal that moves it earlier or later in the chain. */
export function TileMove({ earlierLabel, laterLabel, first, last, onEarlier, onLater }: MoveProps) {
  return (
    <span className="tile-move">
      <button type="button" aria-label={earlierLabel} disabled={first} onClick={onEarlier}>
        ‹
      </button>
      <button type="button" aria-label={laterLabel} disabled={last} onClick={onLater}>
        ›
      </button>
    </span>
  );
}
