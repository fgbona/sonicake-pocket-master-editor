'use client';

import { MB_CATALOG, type MbResolvedBlock } from '@pocket-master/core';
import { hasTube } from '@/lib/ampSkins';
import { mbAmpSkin, mbFxidHex, mbLookKey, mbModelValue, parseMbModelValue } from '@/lib/matriboxLook';
import { mbMenuModels } from '@/lib/matriboxMenus';
import { AmpDecor } from './AmpDecor';
import { MatriboxParam } from './MatriboxParam';
import { ModelPicker } from './ModelPicker';
import { ModuleIcon } from './ModuleIcon';
import { BlockScreen, blockHasScreen } from './workstation/BlockScreen';
import { rigCategory, rigIconSpec } from '@/lib/rigIcon';
import { RigIcon } from './rig/RigIcon';
import { useI18n } from './I18n';
import { useState } from 'react';

interface Props {
  block: MbResolvedBlock;
  /** The slot's 15 stored values, shown raw when the catalog does not name the model. */
  values: readonly number[];
  /** The user IR or capture an IR or CLONE model plays; the model menu names it so. */
  userSlot: (block: Pick<MbResolvedBlock, 'module' | 'fxid'>) => string | undefined;
  disabled: boolean;
  onParam: (slot: number, id: number, value: number) => void;
  onOn: (slot: number, on: boolean) => void;
  /** Change model names the block's storage slot, not its chain position. */
  onModel: (slot: number, moduleIndex: number, fxid: number) => void;
  onRemove: (position: number) => void;
  /** Whether a parameter (by widget id) differs from what the unit stores. */
  paramDirty?: (id: number, value: number) => boolean;
}

const round = (n: number) => String(Number(n.toFixed(2)));
/** Knobs on one page of the panel, like the unit's own screen pages; a model with more gets page buttons. */
const PAGE = 8;

/** The amp's gain as 0..1, for how hot the tube glows; middle when the model has no gain knob. */
function driveOf(block: MbResolvedBlock): number {
  const gain = block.params.find((p) => /gain/i.test(p.name));
  if (!gain || gain.max === gain.min || !Number.isFinite(gain.value)) return 0.5;
  return (gain.value - gain.min) / (gain.max - gain.min);
}

/**
 * The selected block of the loaded Matribox preset, in the Pocket Master's block panel: module and
 * model menu, on/off, every parameter as a knob, switch or small selector, and an AMP dressed like
 * the gear its model is based on.
 */
export function MatriboxBlockPanel({ block, values, userSlot, disabled, onParam, onOn, onModel, onRemove, paramDirty }: Props) {
  const { t, lang } = useI18n();
  const key = mbLookKey(block);
  const name = `${block.position}. ${block.module}`;
  const unknown = t('mb.unknownModel', { fxid: mbFxidHex(block.fxid) });
  const value = mbModelValue(block.moduleIndex, block.fxid);
  // Only this block's module: a model change keeps the block type. A model the catalog does not name still shows as the chosen one.
  const listed = mbMenuModels(MB_CATALOG, block.moduleIndex, { other: t('block.otherModels'), userName: (fxid) => userSlot({ module: block.module, fxid }) });
  const groups = block.model ? listed : [{ name: null, options: [{ value, name: unknown, disabled: true }] }, ...listed];
  const gear = block.model?.basedOn ?? '';
  const description = block.model?.description[lang] ?? '';
  // The faceplate needs the model: an AMP the catalog does not name shows its raw values like any block.
  const amp = key === 'amp' && block.model !== null;
  const skin = amp && block.model ? mbAmpSkin(block.model.basedOn) : null;
  const pages = Math.ceil(block.params.length / PAGE);
  // The page, kept per model: another block or model opens on its first page.
  const [paged, setPaged] = useState({ key: '', page: 0 });
  const modelKey = `${block.slot}:${block.fxid}`;
  const page = paged.key === modelKey ? Math.min(paged.page, pages - 1) : 0;
  const shown = pages > 1 ? block.params.slice(page * PAGE, (page + 1) * PAGE) : block.params;

  return (
    <section className={`editor mb-${key}${block.on ? '' : ' editor-off'}`} aria-label={t('editor.aria', { block: name })}>
      <header className="editor-head">
        <ModuleIcon blockKey={key} size={36} />
        <span className="editor-label">{block.module}</span>
        <ModelPicker
          ariaLabel={t('block.modelAria', { block: name })}
          value={value}
          groups={groups}
          onChange={(v) => {
            const model = parseMbModelValue(v);
            if (model && !disabled) onModel(block.slot, model.moduleIndex, model.fxid);
          }}
        />
        <span className="editor-end">
          <button type="button" className="btn btn-small" disabled={disabled} aria-label={t('mb.removeAria', { block: name })} onClick={() => onRemove(block.position - 1)}>
            {t('mb.remove')}
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={block.on}
            aria-label={t(block.on ? 'block.onAria' : 'block.offAria', { block: name })}
            className={`switch${block.on ? ' switch-on' : ''}`}
            disabled={disabled}
            onClick={() => onOn(block.slot, !block.on)}
          >
            <span className="switch-knob" />
          </button>
        </span>
      </header>
      <div className={`editor-face ${amp ? 'face-amp' : `face-mb-${key}`}`} data-skin={skin ?? undefined}>
        {amp && <AmpDecor on={block.on} drive={driveOf(block)} tubeKey={block.fxid} tube={hasTube(skin)} />}
        {block.model ? (
          block.params.length === 0 ? (
            <p className="muted small">{t('block.noParams')}</p>
          ) : (
            <>
              {pages > 1 && (
                <div className="ws-param-pages" role="group" aria-label={t('ws.paramPages')}>
                  {Array.from({ length: pages }, (_, i) => (
                    <button key={i} type="button" aria-pressed={i === page} onClick={() => setPaged({ key: modelKey, page: i })}>
                      {t('ws.paramPage', { from: i * PAGE + 1, to: Math.min((i + 1) * PAGE, block.params.length) })}
                    </button>
                  ))}
                </div>
              )}
              <div className={amp ? 'ws-face-row' : 'ws-face-row has-visual'}>
                {/* Beside the knobs: the block's live screen, or its gear drawing and model. */}
                {!amp && (
                  <div className="ws-face-visual">
                    {blockHasScreen(block) ? (
                      <BlockScreen block={block} />
                    ) : (
                      <>
                        <RigIcon spec={rigIconSpec(rigCategory(block), `${block.moduleIndex}:${block.fxid}`, block.params.length, block.model.name)} size={96} />
                        <span className="ws-face-model">{block.model.name}</span>
                      </>
                    )}
                  </div>
                )}
                <div className="editor-params">
                  {shown.map((p) => (
                    <MatriboxParam
                      key={p.id}
                      param={p}
                      spec={block.model?.params.find((m) => m.id === p.id)}
                      disabled={disabled}
                      dirty={paramDirty?.(p.id, p.value) ?? false}
                      onChange={(v) => onParam(block.slot, p.id, v)}
                    />
                  ))}
                </div>
              </div>
            </>
          )
        ) : (
          <div className="mb-raw">
            <p className="muted small">{t('mb.rawValues', { slot: block.slot + 1 })}</p>
            <ol className="mb-raw-values" aria-label={t('mb.rawAria', { block: name })}>
              {values.map((v, i) => (
                <li key={i}>
                  <span className="muted">{i}</span> {round(v)}
                </li>
              ))}
            </ol>
          </div>
        )}
        {amp && gear && <p className="amp-script">{t('editor.basedOn', { gear })}</p>}
        {block.model && ((gear && !amp) || description) && (
          <p className="editor-info">
            {gear && !amp ? t('editor.basedOn', { gear }) : ''}
            {gear && !amp && description ? ' · ' : ''}
            {description}
          </p>
        )}
      </div>
    </section>
  );
}
