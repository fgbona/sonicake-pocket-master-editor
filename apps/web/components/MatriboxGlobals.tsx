'use client';

import type { ReactNode } from 'react';
import { MB_FS_FUNCTIONS, MB_GLOBALS, type MbGlobalSetting } from '@pocket-master/core';
import type { MessageKey } from '@/lib/messages';
import type { Matribox } from '@/lib/useMatribox';
import { Knob } from './Knob';
import { Segmented } from './SettingsDialog';
import { useI18n } from './I18n';
import { EqGraph } from './workstation/EqGraph';

const CHANNELS = Array.from({ length: 17 }, (_, i) => i);
/** Output channels: -1 off, then Omni and 1..16. */
const OUT_CHANNELS = [-1, ...CHANNELS];
const CLOCK_TRS = 1;
const CLOCK_USB = 2;
const { tempoBpm } = MB_GLOBALS;

export function Switch(p: { label: string; on: boolean; disabled: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="settings-row">
      <span className="settings-label">{p.label}</span>
      <button type="button" role="switch" aria-checked={p.on} aria-label={p.label} className={`hw-switch${p.on ? ' is-on' : ''}`} disabled={p.disabled} onClick={() => p.onChange(!p.on)}>
        <span className="hw-switch-led" aria-hidden="true" />
      </button>
    </div>
  );
}

/** A group shown folded: the less used settings stay out of the way. */
function FoldedGroup(p: { title: string; children: ReactNode }) {
  return (
    <details className="settings-group">
      <summary>
        <h3>{p.title}</h3>
      </summary>
      {p.children}
    </details>
  );
}

function Choice(p: { label: string; value: number; options: readonly (readonly [number, string])[]; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <label className="settings-row">
      <span className="settings-label">{p.label}</span>
      <select className="param-select hw-select" value={p.value} disabled={p.disabled} onChange={(e) => p.onChange(Number(e.target.value))}>
        {p.options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChannelSelect(p: { label: string; value: number; disabled: boolean; onChange: (v: number) => void; off?: string }) {
  return (
    <label className="settings-row">
      <span className="settings-label">{p.label}</span>
      <select className="param-select hw-select" value={p.value} disabled={p.disabled} onChange={(e) => p.onChange(Number(e.target.value))}>
        {(p.off ? OUT_CHANNELS : CHANNELS).map((c) => (
          <option key={c} value={c}>
            {c === -1 ? p.off : c === 0 ? 'Omni' : c}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A level shown as a hardware knob (same props the range slider had). */
export function Slider(p: { label: string; value: number; min: number; max: number; unit?: string; disabled: boolean; onChange: (v: number) => void }) {
  const shown = `${p.unit === 'dB' && p.value > 0 ? '+' : ''}${Math.round(p.value * 10) / 10}${p.unit ? ` ${p.unit}` : ''}`;
  return (
    <div className="settings-row settings-knob">
      <Knob label={p.label} value={p.value} min={p.min} max={p.max} display={shown} disabled={p.disabled} onChange={p.onChange} />
    </div>
  );
}

/**
 * Global options of the Matribox II Pro: the settings whose write was captured from the official
 * editor (core globals.ts), read when the editor connects and kept up to date with what is changed
 * on the unit. Each change is one write, confirmed by the unit; brightness and the EQ's frequencies are shown only.
 * They live in the workstation dock's Global & EQ tab, a page of the unit rather than a dialog.
 */
export function MatriboxGlobals({ mb }: { mb: Matribox }) {
  const { t } = useI18n();
  const g = mb.globals;
  const off = mb.busy !== null || !g;
  const general = g?.general;
  const set = (setting: MbGlobalSetting) => (v: number) => mb.setGlobal(setting, v);
  const fsFunctions = MB_FS_FUNCTIONS.map((f) => [f.id, t(`mb.fsFn.${f.id}` as MessageKey)] as const);
  const levelSlider = (setting: 'usbRecLevel' | 'usbMonitorLevel', label: string) =>
    general && <Slider label={label} value={general[setting]} min={MB_GLOBALS[setting].min} max={MB_GLOBALS[setting].max} unit="dB" disabled={off} onChange={set(setting)} />;
  return (
    <section className="panel ws-globals" aria-label={t('settings.title')}>
      <div className="panel-head">
        <h2>{t('settings.title')}</h2>
      </div>
      <div className="ws-globals-body">
        {!g || !general ? (
          <p className="muted">{mb.busy ? t('settings.reading') : t('settings.unreadable')}</p>
        ) : (
          <div className="settings">
            <section className="settings-group" aria-label={t('mbGlobal.inOut')}>
              <h3>{t('mbGlobal.inOut')}</h3>
              <Segmented
                label={t('mbGlobal.inputMode')}
                value={general.inputMode}
                options={[t('mbGlobal.acoustic'), t('mbGlobal.electric'), t('mbGlobal.line')]}
                disabled={off}
                onChange={set('inputMode')}
              />
              <Slider
                label={t('mbGlobal.inputLevel')}
                value={general.inputLevel}
                min={MB_GLOBALS.inputLevel.min}
                max={MB_GLOBALS.inputLevel.max}
                unit="dB"
                disabled={off}
                onChange={set('inputLevel')}
              />
              <Slider label={t('mbGlobal.auxLevel')} value={general.auxLevel} min={MB_GLOBALS.auxLevel.min} max={MB_GLOBALS.auxLevel.max} disabled={off} onChange={set('auxLevel')} />
            </section>
            <section className="settings-group" aria-label={t('mbGlobal.functions')}>
              <h3>{t('mbGlobal.functions')}</h3>
              <Segmented label={t('mbGlobal.mode')} value={general.currentMode} options={['Stomp', 'Preset']} disabled={off} onChange={set('currentMode')} />
              <Segmented label={t('mbGlobal.bankMode')} value={general.bankMode} options={[t('mbGlobal.bankWait'), t('mbGlobal.bankInitial')]} disabled={off} onChange={set('bankMode')} />
              <Switch label={t('mbGlobal.autoCab')} on={general.autoCab !== 0} disabled={off} onChange={(on) => mb.setGlobal('autoCab', on ? 1 : 0)} />
              <Switch label={t('mbGlobal.tempo')} on={general.tempoOn !== 0} disabled={off} onChange={(on) => mb.setGlobal('tempoOn', on ? 1 : 0)} />
              <Slider
                label={t('mbGlobal.tempoBpm')}
                value={Math.min(Math.max(general.tempoBpm, tempoBpm.min), tempoBpm.max)}
                min={tempoBpm.min}
                max={tempoBpm.max}
                unit="BPM"
                disabled={off}
                onChange={set('tempoBpm')}
              />
              <p className="muted small">{t('mbGlobal.tempoNote')}</p>
              <div className="settings-row">
                <span className="settings-label">{t('mbGlobal.brightness')}</span>
                <span className="param-value">{general.brightness} %</span>
              </div>
            </section>
            <section className="settings-group" aria-label="MIDI">
              <h3>MIDI</h3>
              <ChannelSelect label={t('mbGlobal.channel')} value={general.midiInUsb} disabled={off} onChange={set('midiInUsb')} />
              <ChannelSelect label={t('mbGlobal.channelTrs')} value={general.midiInTrs} disabled={off} onChange={set('midiInTrs')} />
              <label className="settings-row">
                <span className="settings-label">{t('mbGlobal.source')}</span>
                <select className="param-select hw-select" value={general.midiSource} disabled={off} onChange={(e) => mb.setGlobal('midiSource', Number(e.target.value))}>
                  <option value={0} disabled>
                    {t('mbGlobal.sourceTrs')}
                  </option>
                  <option value={1}>{t('mbGlobal.sourceUsb')}</option>
                  <option value={2}>{t('mbGlobal.sourceMixed')}</option>
                </select>
              </label>
              <p className="muted small">{t('mbGlobal.sourceNote')}</p>
            </section>
            <FoldedGroup title={t('mbGlobal.midiMore')}>
              <ChannelSelect label={t('mbGlobal.outUsb')} value={general.midiOutUsb} off={t('mbGlobal.midiOff')} disabled={off} onChange={set('midiOutUsb')} />
              <ChannelSelect label={t('mbGlobal.outTrs')} value={general.midiOutTrs} off={t('mbGlobal.midiOff')} disabled={off} onChange={set('midiOutTrs')} />
              <Choice
                label={t('mbGlobal.clockSource')}
                value={general.clockSource}
                options={[
                  [0, t('mbGlobal.clockInternal')],
                  [1, t('mbGlobal.sourceTrs')],
                  [2, t('mbGlobal.sourceUsb')],
                  [3, t('mbGlobal.clockExternal')],
                  [4, t('mbGlobal.sourceMixed')],
                ]}
                disabled={off}
                onChange={set('clockSource')}
              />
              <Switch
                label={t('mbGlobal.clockOutUsb')}
                on={(general.clockOut & CLOCK_USB) !== 0}
                disabled={off}
                onChange={(on) => mb.setGlobal('clockOut', on ? general.clockOut | CLOCK_USB : general.clockOut & ~CLOCK_USB)}
              />
              <Switch
                label={t('mbGlobal.clockOutTrs')}
                on={(general.clockOut & CLOCK_TRS) !== 0}
                disabled={off}
                onChange={(on) => mb.setGlobal('clockOut', on ? general.clockOut | CLOCK_TRS : general.clockOut & ~CLOCK_TRS)}
              />
            </FoldedGroup>
            <FoldedGroup title={t('mbGlobal.usb')}>
              {levelSlider('usbRecLevel', t('mbGlobal.usbRecLevel'))}
              {levelSlider('usbMonitorLevel', t('mbGlobal.usbMonitorLevel'))}
              <Switch label={t('mbGlobal.usbRecAux')} on={general.usbRecAux !== 0} disabled={off} onChange={(on) => mb.setGlobal('usbRecAux', on ? 1 : 0)} />
              <Segmented label={t('mbGlobal.usbRecL')} value={general.usbRecWetL} options={[t('mbGlobal.dry'), t('mbGlobal.wet')]} disabled={off} onChange={set('usbRecWetL')} />
              <Segmented label={t('mbGlobal.usbRecR')} value={general.usbRecWetR} options={[t('mbGlobal.dry'), t('mbGlobal.wet')]} disabled={off} onChange={set('usbRecWetR')} />
            </FoldedGroup>
            <FoldedGroup title={t('mbGlobal.exp2')}>
              <Segmented
                label={t('mbGlobal.exp2Jack')}
                value={general.exp2Jack}
                options={[t('mbGlobal.exp2Pedal'), t('mbGlobal.exp2One'), t('mbGlobal.exp2Two')]}
                disabled={off}
                onChange={set('exp2Jack')}
              />
              {general.exp2Jack !== 0 && <Choice label={t('mbGlobal.extFs', { n: 1 })} value={general.extFs1} options={fsFunctions} disabled={off} onChange={set('extFs1')} />}
              {general.exp2Jack === 2 && <Choice label={t('mbGlobal.extFs', { n: 2 })} value={general.extFs2} options={fsFunctions} disabled={off} onChange={set('extFs2')} />}
            </FoldedGroup>
            <section className="settings-group" aria-label={t('mbGlobal.eq')}>
              <h3>{t('mbGlobal.eq')}</h3>
              <EqGraph eq={g.eq} eqOn={g.eqOn} disabled={off} onOn={mb.setEqOn} onLevel={mb.setEqLevel} onGain={mb.setEqGain} onFrequency={mb.setEqFrequency} onQ={mb.setEqQ} />
            </section>
          </div>
        )}
      </div>
    </section>
  );
}
