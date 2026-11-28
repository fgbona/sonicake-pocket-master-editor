'use client';

import { useEffect, useRef, useState } from 'react';
import { checkMbPresetName, MB_PRESET_COUNT, mbPresetLabel, type MbPresetName } from '@pocket-master/core';
import { downloadJson } from '@/lib/backupStore';
import type { MbBackup } from '@/lib/matribox';
import { mbBackupFileName } from '@/lib/matriboxBackups';
import { Dialog } from './Dialog';
import { useI18n } from './I18n';
import { RoleButtons } from './workstation/RoleButtons';

interface Props {
  open: boolean;
  current: number;
  names: readonly MbPresetName[];
  loadedName: string;
  busy: boolean;
  error: string | null;
  /** The newest backup, offered for download once a save ends. */
  lastBackup: MbBackup | null;
  storageWarning: boolean;
  onSave: (index: number, name: string) => Promise<boolean>;
  onClose: () => void;
}

const validName = (name: string) => {
  try {
    checkMbPresetName(name);
    return true;
  } catch {
    return false; // the rule is shown in the UI language (mb.nameRule)
  }
};

/** Saves the loaded preset to a slot: explicit confirmation, and the slot is backed up first. */
export function MatriboxSaveDialog({ open, current, names, loadedName, busy, error, lastBackup, storageWarning, onSave, onClose }: Props) {
  const { t, te } = useI18n();
  const [target, setTarget] = useState(current);
  const [name, setName] = useState(loadedName);
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState(false);
  // Filled in when it opens only: a save to another slot loads that slot, which must not reset the dialog.
  const wasOpen = useRef(false);
  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!opening) return;
    setTarget(current);
    setName(loadedName.trim());
    setConfirmed(false);
    setDone(false);
  }, [open, current, loadedName]);
  const label = mbPresetLabel(target);
  const valid = validName(name);
  const backupOffer = lastBackup && (
    <p className="small">
      {storageWarning && <strong>{t('mb.backupNotKept')} </strong>}
      <button type="button" className="btn-link" onClick={() => downloadJson(lastBackup, mbBackupFileName(lastBackup))}>
        {t('mb.backupDownload', { slot: lastBackup.label })}
      </button>
    </p>
  );
  return (
    <Dialog open={open} title={t('mb.saveTitle')} onClose={onClose} locked={busy}>
      {done ? (
        <>
          <p>{t('mb.saved', { slot: label, name })}</p>
          {backupOffer}
          <div className="sheet-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {t('action.done')}
            </button>
          </div>
        </>
      ) : (
        <form
          className="sheet-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (valid && confirmed && (await onSave(target, name))) setDone(true);
          }}
        >
          <label className="field">
            <span>{t('save.slot')}</span>
            <select
              value={target}
              onChange={(e) => {
                setTarget(Number(e.target.value));
                setConfirmed(false);
              }}
              disabled={busy}
            >
              {Array.from({ length: MB_PRESET_COUNT }, (_, i) => (
                <option key={i} value={i}>
                  {mbPresetLabel(i)} · {names[i]?.name ?? ''}
                  {i === current ? ` ${t('save.loaded')}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('save.name')}</span>
            <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} aria-invalid={!valid} autoComplete="off" spellCheck={false} disabled={busy} />
          </label>
          <RoleButtons name={name} max={16} disabled={busy} onName={setName} />
          {!valid && name.length > 0 && <p className="field-error">{t('mb.nameRule')}</p>}
          <label className="mb-confirm">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy} />
            <span>{t('mb.saveConfirm', { slot: label, name: names[target]?.name ?? '' })}</span>
          </label>
          {error && (
            <p className="alert" role="alert">
              {te(error)}
            </p>
          )}
          {error && backupOffer}
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              {t('action.cancel')}
            </button>
            <button type="submit" className="btn btn-danger" disabled={busy || !valid || !confirmed}>
              {t(busy ? 'mb.saving' : 'save.submit', { slot: label })}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
