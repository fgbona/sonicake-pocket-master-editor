'use client';

import { type Block, blockModelLabel, chainUnits, type Edit, moveInChain } from '@pocket-master/core';
import { PedalTile, TileMove, TileStrip } from './TileStrip';
import { useI18n } from './I18n';
import { useTileDrag } from './useTileDrag';
import { pmRigCategory, rigIconSpec } from '@/lib/rigIcon';
import { RigIcon } from './rig/RigIcon';

interface Props {
  chain: readonly Block[];
  editable: boolean;
  selected: number;
  onSelect: (module: number) => void;
  onEdit: (edit: Edit) => void;
  irNames: readonly (string | null)[] | null;
  profileNames: readonly (string | null)[] | null;
  ampMode: 'normal' | 'clone';
  /** Modules whose stored values the edit buffer no longer matches. */
  dirty?: ReadonlySet<number>;
}

/**
 * The signal chain as pedals: drawing, label, model, an on/off LED. A
 * click selects the block for the editor; in live edit units drag (or move with the arrows), and
 * DRV-AMP-IR-EQ move together.
 */
export function ChainTiles({ chain, editable, selected, onSelect, onEdit, irNames, profileNames, ampMode, dirty }: Props) {
  const { t } = useI18n();
  const order = chain.map((b) => b.module);
  const byModule = new Map(chain.map((b) => [b.module, b]));
  const units = chainUnits(order);
  const move = (module: number, to: number) => {
    const next = moveInChain(order, module, to);
    if (next.some((m, i) => m !== order[i])) onEdit({ kind: 'chain', order: next });
  };
  const drag = useTileDrag(editable, move);

  return (
    <TileStrip deps={[chain.length]} editable={editable}>
      {units.map((unit, index) => {
        const lead = unit[0] as number;
        const name = unit.map((m) => byModule.get(m)?.label).join('-');
        const { className, ...dragProps } = drag(lead, index);
        return (
          <li key={lead} className={`tile-unit${unit.length > 1 ? ' tile-group' : ''}${className}`} {...dragProps}>
            {unit.map((m) => {
              const b = byModule.get(m) as Block;
              const model = blockModelLabel(b, ampMode, irNames, profileNames);
              return (
                <PedalTile
                  key={m}
                  tint={`block-${b.key}`}
                  icon={b.key}
                  label={b.label}
                  model={model}
                  on={b.on}
                  selected={selected === m}
                  editable={editable}
                  selectLabel={t('tile.select', { block: b.label, model })}
                  ledLabel={t(b.on ? 'block.onAria' : 'block.offAria', { block: b.label })}
                  onSelect={() => onSelect(m)}
                  onToggle={() => onEdit({ kind: 'on', module: b.module, on: !b.on })}
                  dirtyLabel={dirty?.has(m) ? t('ws.blockEdited') : undefined}
                  drawing={<RigIcon spec={rigIconSpec(pmRigCategory(b, ampMode), `${b.key}:${b.code}`, b.params.length, b.model)} size={56} />}
                />
              );
            })}
            {editable && (
              <TileMove
                earlierLabel={t('chain.earlier', { name })}
                laterLabel={t('chain.later', { name })}
                first={index === 0}
                last={index === units.length - 1}
                onEarlier={() => move(lead, index - 1)}
                onLater={() => move(lead, index + 1)}
              />
            )}
          </li>
        );
      })}
    </TileStrip>
  );
}
