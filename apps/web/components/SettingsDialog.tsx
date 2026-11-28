'use client';

import { useEffect, useState } from 'react';
import { type GlobalSetting, type GlobalSettings, readGlobals, setGlobal, type PocketMasterLink } from '@pocket-master/core';
import { Dialog } from './Dialog';
import { Knob } from './Knob';
import { useI18n } from './I18n';
import type { Exclusive } from '@/lib/install';
import type { MessageKey } from '@/lib/i18n';

interface Props {
  open: boolean;
  /** Firmware version the pedal reported on connecting, shown for reference. */
  firmware: string | null;
  onClose: () => void;
  exclusive: Exclusive;
  writeGlobal: (bytes: Uint8Array) => void;
  busy: boolean;
  /** The hook's last error, shown inside the dialog so a failed read or write is not hidden behind it. */
  error: string | null;
  /** Sends the factory reset; resolves true once sent (the pedal then reboots). */
  factoryReset: () => Promise<boolean>;
  /** Called after a factory reset was sent: the pedal reboots and the link is gone. */
  onReset: () => void;
  /** In the workstation dock's Global & EQ tab instead of a dialog; `open` then means "read and shown". */
  inline?: boolean;
  /** Inline only: asks to read them (the tab shows them once asked, so connecting reads nothing extra). */
  onOpen?: () => void;
}

type Values = { [K in GlobalSetting]: number | null };

const LEVELS: readonly { key: GlobalSetting; label: MessageKey }[] = [
  { key: 'inputLevel', label: 'settings.input' },
  { key: 'fxRecLevel', label: 'settings.fxRec' },
  { key: 'monitorLevel', label: 'settings.monitor' },
  { key: 'btRecLevel', label: 'settings.btRec' },
];
const RESET_WORD = 'RESET';

function fromDump(g: GlobalSettings): Values {
  return { ...g, battOnly: null };
}

/** One choice of a few, as a row of the Global options (shared with the Matribox's). */
export function Segmented({ label, value, options, disabled, onChange }: { label: string; value: number | null; options: readonly string[]; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div className="settings-row">
      <span className="settings-label">{label}</span>
      <span className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o, i) => (
          <button key={o} type="button" role="radio" aria-checked={value === i} className={value === i ? 'is-on' : ''} disabled={disabled} onClick={() => onChange(i)}>
            {o}
          </button>
        ))}
      </span>
    </div>
  );
}

/** Global Options: the Pocket Master's device-wide levels, display and boot anti-touch protection, factory reset. */
export function SettingsDialog({ open, firmware, onClose, exclusive, writeGlobal, busy, error, factoryReset, onReset, inline = false, onOpen }: Props) {
  const { t } = useI18n();
  const [values, setValues] = useState<Values | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) return;
    setValues(null);
    setConfirming(false);
    setTyped('');
    void exclusive('Reading settings', (link: PocketMasterLink) => readGlobals(link)).then((g) => {
      if (g) setValues(fromDump(g));
    });
  }, [open, exclusive]);

  const set = (key: GlobalSetting, value: number) => {
    if (!values) return;
    setValues({ ...values, [key]: value });
    writeGlobal(setGlobal(key, value));
  };
  const reset = async () => {
    const sent = await factoryReset();
    if (sent) {
      onClose();
      onReset();
    }
  };
  const off = busy || values === null;
  const content = (
    <>
      {values === null ? (
        <p className="muted">{busy ? t('settings.reading') : t('settings.unreadable')}</p>
      ) : (
        <div className="settings">
          <section className="settings-group" aria-label={t('settings.levels')}>
            <h3>{t('settings.levels')}</h3>
            <div className="settings-knobs">
              <Knob
                label={t('settings.master')}
                value={values.masterVolume ?? 0}
                min={0}
                max={100}
                display={String(values.masterVolume ?? 0)}
                disabled={off}
                onChange={(v) => set('masterVolume', v)}
              />
              {LEVELS.map(({ key, label }) => (
                <Knob
                  key={key}
                  label={t(label)}
                  value={values[key] ?? 0}
                  min={-20}
                  max={20}
                  defaultValue={0}
                  display={`${(values[key] ?? 0) > 0 ? '+' : ''}${values[key] ?? 0} dB`}
                  disabled={off}
                  onChange={(v) => set(key, v)}
                />
              ))}
            </div>
          </section>
          <section className="settings-group">
            <h3>{t('settings.device')}</h3>
            <div className="settings-row">
              <Knob label={t('settings.backlight')} value={values.backlight ?? 0} min={0} max={100} display={String(values.backlight ?? '—')} disabled={off} onChange={(v) => set('backlight', v)} />
            </div>
            {firmware && (
              <div className="settings-row">
                <span className="settings-label">{t('settings.firmware')}</span>
                <span className="param-value">{firmware}</span>
              </div>
            )}
            <Segmented label={t('settings.bootProtection')} value={values.bootProtection} options={[t('block.off'), t('block.on')]} disabled={off} onChange={(v) => set('bootProtection', v)} />
          </section>
          <section className="settings-group settings-danger">
            <h3>{t('settings.reset')}</h3>
            {!confirming ? (
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setConfirming(true)}>
                {t('settings.reset')}
              </button>
            ) : (
              <>
                <p className="small">{t('settings.resetWarning', { word: RESET_WORD })}</p>
                <div className="sheet-actions">
                  <input value={typed} aria-label={t('settings.resetType', { word: RESET_WORD })} placeholder={RESET_WORD} onChange={(e) => setTyped(e.target.value)} />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setConfirming(false);
                      setTyped('');
                    }}
                  >
                    {t('action.cancel')}
                  </button>
                  <button type="button" className="btn btn-danger" disabled={busy || typed !== RESET_WORD} onClick={() => void reset()}>
                    {t('settings.resetConfirm')}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
  return inline ? (
    <section className="panel ws-globals" aria-label={t('settings.title')}>
      <div className="panel-head">
        <h2>{t('settings.title')}</h2>
      </div>
      <div className="ws-globals-body">
        {open ? (
          content
        ) : (
          <button type="button" className="btn" disabled={busy} onClick={onOpen}>
            {t('ws.globalsRead')}
          </button>
        )}
      </div>
    </section>
  ) : (
    <Dialog open={open} title={t('settings.title')} onClose={onClose} locked={busy}>
      {content}
      {error && !busy && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn btn-primary" onClick={onClose} disabled={busy}>
          {t('action.done')}
        </button>
      </div>
    </Dialog>
  );
}
