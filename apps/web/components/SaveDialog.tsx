'use client';

import { useEffect, useRef, useState } from 'react';
import { encodeName, presetLabel, USER_PRESETS, NAME_LENGTH, type BackupFile, type Progress } from '@pocket-master/core';
import { FlowBackups } from './FlowBackups';
import { useI18n } from './I18n';
import { RoleButtons } from './workstation/RoleButtons';
import { Dialog } from './Dialog';
import { ProgressBar } from './ProgressBar';

interface Props {
  open: boolean;
  presetIndex: number | null;
  names: readonly string[] | null;
  busy: Progress | null;
  /** Why the last save failed; shown inside the dialog. */
  error: string | null;
  /** Backups the last save took, offered for download. */
  flowBackups: readonly BackupFile[];
  storageWarning: string | null;
  onDownload: (file: BackupFile) => void;
  onSave: (target: number, name: string, backup: boolean) => Promise<boolean>;
  onClose: () => void;
  /** A slot and name proposed by the tone assistant, instead of the loaded slot and its name. */
  proposal?: { readonly target: number; readonly name: string } | null;
  /** Called once a save succeeded. */
  onSaved?: () => void;
}

const slotName = (names: readonly string[] | null, index: number) => (names?.[index] ?? '').trim().slice(0, NAME_LENGTH);

const nameError = (name: string) => {
  try {
    encodeName(name);
    return false;
  } catch {
    return true; // the rule is shown in the UI language (save.nameRule)
  }
};

export function SaveDialog({ open, presetIndex, names, busy, error: saveError, flowBackups, storageWarning, onDownload, onSave, onClose, proposal, onSaved }: Props) {
  const initial = presetIndex !== null && presetIndex < USER_PRESETS ? presetIndex : 0;
  const [target, setTarget] = useState(initial);
  const [name, setName] = useState('');
  const [done, setDone] = useState(false);
  const { t, te } = useI18n();

  // Every opening starts fresh on the loaded slot, with that slot's name (not last time's).
  // Only an opening: a save to another slot loads that slot, and must not wipe the "Saved" step.
  const initialRef = useRef(initial);
  initialRef.current = initial;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only an opening resets the form; names changing after a save must not (see above)
  useEffect(() => {
    if (!open) return;
    const start = proposal?.target ?? initialRef.current;
    setTarget(start);
    setName(proposal?.name ?? slotName(names, start));
    setDone(false);
  }, [open, proposal]);

  // Names can arrive after the dialog opens; fill the name once they do, without overwriting typing.
  useEffect(() => {
    if (open && names) setName((n) => n || slotName(names, target));
  }, [open, names, target]);

  const current = names?.[target] ?? '';
  const invalid = nameError(name);
  const label = presetLabel(target);
  const vars = { slot: label, name };

  return (
    <Dialog open={open} title={t('save.title')} onClose={onClose} locked={busy !== null}>
      {busy ? (
        <ProgressBar progress={busy} />
      ) : done ? (
        <>
          <p>{t('save.done', vars)}</p>
          <FlowBackups backups={flowBackups} warning={storageWarning} onDownload={onDownload} />
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
            if (invalid) return;
            if (await onSave(target, name, false)) {
              setDone(true);
              onSaved?.();
            }
          }}
        >
          <label className="field">
            <span>{t('save.slot')}</span>
            <select
              value={target}
              onChange={(e) => {
                const index = Number(e.target.value);
                setTarget(index);
                setName(slotName(names, index));
              }}
            >
              {Array.from({ length: USER_PRESETS }, (_, i) => (
                <option key={i} value={i}>
                  {presetLabel(i)}
                  {names?.[i] ? ` · ${names[i]}` : ''}
                  {i === presetIndex ? ` ${t('save.loaded')}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('save.name')}</span>
            <input value={name} maxLength={NAME_LENGTH} onChange={(e) => setName(e.target.value)} aria-invalid={invalid} aria-describedby="save-name-error" autoComplete="off" spellCheck={false} />
          </label>
          <RoleButtons name={name} max={NAME_LENGTH} onName={setName} />
          {invalid && name.length > 0 && (
            <p className="field-error" id="save-name-error">
              {t('save.nameRule')}
            </p>
          )}
          {saveError && (
            <p className="alert" role="alert">
              {te(saveError)}
            </p>
          )}
          {saveError && flowBackups.length > 0 && <FlowBackups backups={flowBackups} warning={storageWarning} onDownload={onDownload} />}
          <div className="sheet-note">
            <p>
              <strong>{current ? t('save.overwriteNamed', { slot: label, name: current }) : t('save.overwrite', vars)}</strong>
            </p>
          </div>
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={onClose}>
              {t('action.cancel')}
            </button>
            <button type="submit" className="btn btn-danger" disabled={invalid}>
              {t('save.submit', vars)}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
