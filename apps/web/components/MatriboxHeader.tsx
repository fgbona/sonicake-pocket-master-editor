'use client';

import type { ReactNode } from 'react';
import type { DeviceView } from '@/lib/workstation/device';
import { SyncStatus } from './workstation/SyncStatus';
import { RoleChip } from './workstation/RoleButtons';
import type { PresetRole } from '@/lib/workstation/banks';
import { Knob } from './Knob';
import { MatriboxMore } from './MatriboxMore';
import { RedoIcon, UndoIcon } from './icons';
import { useI18n } from './I18n';

interface Props {
  /** "17C". */
  label: string;
  name: string;
  /** The preset's style tag ("Rock"); '' when it has none. */
  style: string;
  edited: boolean;
  volume: number;
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onVolume: (volume: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onRead: () => void;
  onSave: () => void;
  /** Preset-file buttons beside Save (export, import). */
  files?: ReactNode;
  /** The workstation's view of the unit: the sync chip. */
  device?: DeviceView;
  /** The slot's place in its bank (CLEAN, RHY, LEAD or free), a hint shown beside the name. */
  role?: PresetRole | 'free';
  /** "Bank 17": the bank the slot is in. */
  bank?: string;
  /** A notice shown as a small LED beside the actions (the experimental support). */
  notice?: ReactNode;
}

/** The loaded Matribox preset as the Pocket Master's preset header: big label and name, its actions, patch volume as a knob.
 * On a phone, export, import and Read fold under a ⋯ button so the row fits beside the knob. */
export function MatriboxHeader(p: Props) {
  const { t } = useI18n();
  return (
    <div className="preset-head">
      <div>
        <p className="eyebrow">
          {t('preset.editBuffer')}
          {p.edited ? ` · ${t('mb.edited')}` : ''}
          {p.style && <span className="mb-style">{p.style}</span>}
        </p>
        <h1 className="preset-name">
          <span className="preset-number">{p.label}</span>
          <span className="preset-title"> {p.name}</span>
        </h1>
        <span className="ws-lcd-tags">
          {p.bank && <span className="ws-lcd-bank">{p.bank}</span>}
          <RoleChip role={p.role ?? null} />
        </span>
        {p.device && <SyncStatus device={p.device} />}
      </div>
      <div className="mb-head-end">
        <div className="mb-head-actions">
          {p.notice}
          <button type="button" className="btn btn-icon" disabled={p.disabled || !p.canUndo} aria-label={t('action.undo')} title={t('action.undo')} onClick={p.onUndo}>
            <UndoIcon />
          </button>
          <button type="button" className="btn btn-icon" disabled={p.disabled || !p.canRedo} aria-label={t('action.redo')} title={t('action.redo')} onClick={p.onRedo}>
            <RedoIcon />
          </button>
          <button type="button" className="btn" disabled={p.disabled} onClick={p.onSave}>
            {t('action.save')}
          </button>
          <MatriboxMore>
            {p.files}
            <button type="button" className="btn btn-primary" disabled={p.disabled} onClick={p.onRead}>
              {t('action.read')}
            </button>
          </MatriboxMore>
        </div>
        <section className="fields" aria-label={t('fields.aria')}>
          <Knob label={t('mb.volume')} value={p.volume} min={0} max={100} display={String(p.volume)} disabled={p.disabled} onChange={p.onVolume} />
        </section>
      </div>
    </div>
  );
}
