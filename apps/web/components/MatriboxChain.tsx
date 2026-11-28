'use client';

import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { MB_SLOTS, type MbResolvedBlock } from '@pocket-master/core';
import { mbFxidHex, mbLookKey } from '@/lib/matriboxLook';
import { MatriboxAddMenu } from './MatriboxAddMenu';
import { snakePath } from '@/lib/snakePath';
import { PedalTile, TileMove } from './TileStrip';
import { useI18n } from './I18n';
import { useTileDrag } from './useTileDrag';
import { rigCategory, rigIconSpec } from '@/lib/rigIcon';
import { RigIcon } from './rig/RigIcon';

interface Props {
  chain: readonly MbResolvedBlock[];
  /** Storage slot of the block the panel below edits. */
  selected: number | null;
  disabled: boolean;
  /** The user IR or capture an IR or CLONE block plays. */
  userSlot: (block: Pick<MbResolvedBlock, 'module' | 'fxid'>) => string | undefined;
  onSelect: (slot: number) => void;
  onOn: (slot: number, on: boolean) => void;
  onMove: (from: number, to: number) => void;
  onAdd: (moduleIndex: number, fxid: number) => void;
  /** Storage slots whose stored values the edit buffer no longer matches. */
  dirty?: ReadonlySet<number>;
}

/** What a tile says under the module: the model, the user IR or capture it plays, or the raw model id. */
export const mbTileModel = (block: MbResolvedBlock, userSlot: string | undefined) => userSlot ?? block.model?.name ?? mbFxidHex(block.fxid).slice(2);

/** The cable through the wrapped tiles, drawn again whenever the chain or its width changes. */
function useSnakeLine(deps: readonly unknown[]) {
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [path, setPath] = useState('');
  useLayoutEffect(() => {
    const box = wrap.current;
    const ol = list.current;
    if (!box || !ol) return undefined;
    const draw = () => {
      const at = box.getBoundingClientRect();
      // The unit's box keeps the bends clear of the move arrows under a tile; the cable runs through the tile's middle.
      const tiles = Array.from(ol.querySelectorAll(':scope > .tile-unit > .tile'), (el) => {
        const r = (el.parentElement as HTMLElement).getBoundingClientRect();
        const t = el.getBoundingClientRect();
        return { left: t.left - at.left, right: t.right - at.left, top: r.top - at.top, bottom: r.bottom - at.top, mid: (t.top + t.bottom) / 2 - at.top };
      });
      setPath(snakePath(tiles));
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(ol);
    return () => observer.disconnect();
    // biome-ignore lint/correctness/useExhaustiveDependencies: the caller passes the values that change the chain's tiles
  }, deps);
  return { wrap, list, path };
}

/** Room kept between the add menu and the screen's edges. */
const SCREEN_GUTTER = 8;

/**
 * Hangs the open add menu under the add tile wherever the tile wrapped to, moved left as far as it
 * takes to stay on screen; placed again when the menu (its other step) or the chain resizes. On a
 * phone the menu is a bottom sheet fixed to the screen, which this placing does not move.
 */
function useMenuUnder(open: boolean, wrap: RefObject<HTMLElement | null>, tile: RefObject<HTMLElement | null>, menu: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const box = wrap.current;
    const add = tile.current;
    const el = menu.current;
    if (!open || !box || !add || !el) return undefined;
    const place = () => {
      const at = box.getBoundingClientRect();
      const under = add.getBoundingClientRect();
      const room = document.documentElement.clientWidth - SCREEN_GUTTER - el.offsetWidth;
      const left = Math.max(SCREEN_GUTTER, Math.min(under.left, room));
      el.style.left = `${left - at.left}px`;
      el.style.top = `${under.bottom - at.top}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    observer.observe(box);
    return () => observer.disconnect();
  }, [open, wrap, tile, menu]);
}

/**
 * The Matribox's signal chain as the pedals of the Pocket Master's strip, wrapped into rows that
 * read left to right with a cable snaking from each row's end to the next row's start (a Helix-like
 * chain view), so a full chain shows whole with no sideways scroll: a click selects the
 * block, the LED switches it, a drag (or the arrows) moves it, and the last tile adds a block
 * while the unit has a free slot (MatriboxAddMenu).
 */
export function MatriboxChain({ chain, selected, disabled, userSlot, onSelect, onOn, onMove, onAdd, dirty }: Props) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const canAdd = chain.length < MB_SLOTS;
  // One move write per drop; a drop on the tile's own place writes nothing.
  const drag = useTileDrag(!disabled, (from, to) => {
    if (from !== to) onMove(from, to);
  });
  const closeAdd = (refocus: boolean) => {
    setAdding(false);
    if (refocus) addRef.current?.focus();
  };
  const line = useSnakeLine([chain, canAdd, disabled]);
  useMenuUnder(adding, line.wrap, addRef, menuRef);
  return (
    <div className="tiles-wrap mb-snake" ref={line.wrap}>
      <svg className="mb-snake-line" aria-hidden="true" focusable="false">
        {line.path && <path d={line.path} />}
      </svg>
      <ol ref={line.list} className={`tiles${disabled ? '' : ' tiles-editable'}`} aria-label={t('chain.aria')}>
        {chain.map((block, at) => {
          const name = `${block.position}. ${block.module}`;
          const model = mbTileModel(block, userSlot(block));
          const { className, ...dragProps } = drag(at, at);
          return (
            <li key={block.slot} className={`tile-unit mb-unit${className}`} {...dragProps}>
              <PedalTile
                tint={`mb-${mbLookKey(block)}`}
                icon={mbLookKey(block)}
                label={block.module}
                model={model}
                on={block.on}
                selected={selected === block.slot}
                editable={!disabled}
                selectLabel={t('tile.select', { block: name, model })}
                ledLabel={t(block.on ? 'block.onAria' : 'block.offAria', { block: name })}
                onSelect={() => onSelect(block.slot)}
                onToggle={() => onOn(block.slot, !block.on)}
                dirtyLabel={dirty?.has(block.slot) ? t('ws.blockEdited') : undefined}
                drawing={<RigIcon spec={rigIconSpec(rigCategory(block), `${block.moduleIndex}:${block.fxid}`, block.params.length, block.model?.name ?? '')} size={56} />}
              />
              {!disabled && (
                <TileMove
                  earlierLabel={t('mb.moveUp', { n: block.position })}
                  laterLabel={t('mb.moveDown', { n: block.position })}
                  first={at === 0}
                  last={at === chain.length - 1}
                  onEarlier={() => onMove(at, at - 1)}
                  onLater={() => onMove(at, at + 1)}
                />
              )}
            </li>
          );
        })}
        {chain.length === 0 && <li className="tile-unit mb-unit mb-chain-empty muted small">{t('mb.empty')}</li>}
        {canAdd && (
          <li className="tile-unit mb-unit mb-unit-add">
            <button
              ref={addRef}
              type="button"
              className="tile mb-tile-add"
              aria-haspopup="listbox"
              aria-expanded={adding}
              aria-label={t('mb.addBlock')}
              disabled={disabled}
              onClick={() => setAdding(!adding)}
            >
              <span className="mb-tile-plus" aria-hidden="true">
                +
              </span>
              <span className="tile-label">{t('mb.add')}</span>
            </button>
          </li>
        )}
      </ol>
      {adding && canAdd && (
        <div className="picker mb-add-menu" ref={menuRef}>
          <MatriboxAddMenu userSlot={userSlot} isInside={(target) => (addRef.current?.contains(target) || menuRef.current?.contains(target)) ?? false} onClose={closeAdd} onAdd={onAdd} />
        </div>
      )}
    </div>
  );
}
