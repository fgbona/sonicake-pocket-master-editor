'use client';

import { memo, useState } from 'react';
import { presetLabel, USER_PRESETS, type Edit, type Preset } from '@pocket-master/core';
import { slotRole } from '@/lib/workstation/banks';
import { RoleChip } from './workstation/RoleButtons';
import type { DeviceView } from '@/lib/workstation/device';
import { SyncStatus } from './workstation/SyncStatus';
import { ChainTiles } from './ChainTiles';
import { ModuleEditor } from './ModuleEditor';
import { PresetFields } from './PresetFields';
import { useI18n } from './I18n';

interface Props {
  preset: Preset;
  presetIndex: number | null;
  presetName: string | null;
  editable: boolean;
  modified: boolean;
  onEdit: (edit: Edit) => void;
  irNames: readonly (string | null)[] | null;
  profileNames: readonly (string | null)[] | null;
  /** The workstation's view of the pedal: the sync chip and the edited blocks. */
  device?: DeviceView;
}

const AMP_MODULE = 3;

/** Memoised: incoming SysEx packets re-render the page, but the chain only when the preset changes. */
export const ChainView = memo(function ChainView({ preset, presetIndex, presetName, editable, modified, onEdit, irNames, profileNames, device }: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(AMP_MODULE);
  const block = preset.chain.find((b) => b.module === selected) ?? preset.chain[0]!;
  return (
    <section className="preset" aria-label={t('preset.aria')}>
      <div className="preset-head">
        <div>
          <p className="eyebrow">
            {t('preset.editBuffer')}
            {modified ? ` · ${t('preset.modified')}` : ''} · {preset.ampMode === 'clone' ? t('preset.ampCaptured') : t('preset.ampModel')}
          </p>
          <h1 className="preset-name">
            <span className="preset-number">{presetIndex === null ? t('preset.fallbackName') : presetLabel(presetIndex)}</span>
            {presetName && <span className="preset-title"> {presetName}</span>}
          </h1>
          {presetIndex !== null && presetIndex < USER_PRESETS && (
            <span className="ws-lcd-tags">
              <span className="ws-lcd-bank">{t('ws.bank', { n: Math.floor(presetIndex / 3) + 1 })}</span>
              <RoleChip role={slotRole(presetIndex, 3)} />
            </span>
          )}
          {device && <SyncStatus device={device} />}
        </div>
        <PresetFields preset={preset} editable={editable} onEdit={onEdit} />
      </div>
      <ChainTiles
        chain={preset.chain}
        editable={editable}
        selected={block.module}
        onSelect={setSelected}
        onEdit={onEdit}
        irNames={irNames}
        profileNames={profileNames}
        ampMode={preset.ampMode}
        dirty={device?.dirtyBlocks}
      />
      <ModuleEditor
        preset={preset}
        block={block}
        editable={editable}
        onEdit={onEdit}
        irNames={irNames}
        profileNames={profileNames}
        paramDirty={device ? (alg, value) => device.paramDirty(block.module, alg, value) : undefined}
      />
    </section>
  );
});
