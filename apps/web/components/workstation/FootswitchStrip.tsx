'use client';

import { MB_FS_FUNCTIONS, mbFsCtrl, type MbFootswitch, type MbResolvedBlock } from '@pocket-master/core';
import type { MessageKey } from '@/lib/i18n';
import { mbLookKey } from '@/lib/matriboxLook';
import { useI18n } from '../I18n';

interface Props {
  footswitches: readonly MbFootswitch[];
  /** The storage slots each CTRL switches. */
  ctrl: readonly (readonly number[])[];
  chain: readonly MbResolvedBlock[];
  disabled: boolean;
  /** Switches these blocks (storage slots) on or off together, as the footswitch does on the unit. */
  onToggle: (slots: readonly number[], on: boolean) => void;
}

const SWITCHES = ['A', 'B', 'C', 'D'];

/**
 * The unit's footswitches A–D as a strip under the chain, the way the pedal's own switches sit under
 * its screen: each one says what it runs, its LED ring is lit while the blocks it switches are on,
 * and a click switches them like a press in stomp mode. A footswitch on another function (tap tempo,
 * looper…) shows it, and is not clickable here: the editor only sends what it can undo.
 */
export function FootswitchStrip({ footswitches, ctrl, chain, disabled, onToggle }: Props) {
  const { t } = useI18n();
  const fnName = (id: number) => (MB_FS_FUNCTIONS.some((f) => f.id === id) ? t(`mb.fsFn.${id}` as MessageKey) : t('mb.fsFnOther', { n: id }));
  return (
    <div className="ws-fs-strip" role="group" aria-label={t('ws.fsStrip')}>
      {footswitches.map((f, i) => {
        const fs = SWITCHES[i] ?? '';
        const row = mbFsCtrl(f.press);
        const blocks = row === null ? [] : chain.filter((b) => ctrl[row]?.includes(b.slot));
        const on = blocks.length > 0 && blocks.every((b) => b.on);
        const what = row === null ? fnName(f.press) : blocks.length ? blocks.map((b) => b.module).join(' + ') : t('mb.ctrlUnused');
        const tint = blocks.length === 1 ? ` mb-${mbLookKey(blocks[0] as MbResolvedBlock)}` : '';
        const face = (
          <>
            <span className="ws-fs-ring" aria-hidden="true">
              <span className="ws-fs-cap">{fs}</span>
            </span>
            <span className="ws-fs-label">{row === null ? fnName(f.press) : t('mb.ctrlName', { n: row + 1 })}</span>
            <span className="ws-fs-what">{row === null ? '' : what}</span>
          </>
        );
        // A footswitch on another function (tap tempo, looper…) only says so: it is not a button here.
        if (blocks.length === 0)
          return (
            <div key={fs} className="ws-fs is-static" role="img" aria-label={t('ws.fsAria', { fs, what })}>
              {face}
            </div>
          );
        return (
          <button
            key={fs}
            type="button"
            className={`ws-fs${on ? ' is-on' : ''}${tint}`}
            aria-pressed={on}
            aria-label={t('ws.fsAria', { fs, what })}
            disabled={disabled}
            onClick={() =>
              onToggle(
                blocks.map((b) => b.slot),
                !on,
              )
            }
          >
            {face}
          </button>
        );
      })}
    </div>
  );
}
