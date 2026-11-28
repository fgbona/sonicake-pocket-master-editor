'use client';

import {
  type Block,
  blockModelLabel,
  type Edit,
  encodeValue,
  groupModels,
  modelGuide,
  modelInfo,
  modelLabel,
  modelOf,
  modelsFor,
  type ModelSpec,
  paramSpecFor,
  type Preset,
} from '@pocket-master/core';
import { Knob } from './Knob';
import { pmRigCategory, rigIconSpec } from '@/lib/rigIcon';
import { RigIcon } from './rig/RigIcon';
import { DirtyMark } from './workstation/DirtyMark';
import { AmpDecor } from './AmpDecor';
import { ModelPicker, type PickerGroup, type PickerOption } from './ModelPicker';
import { noteFor, useSlotNotes } from '@/lib/slotNotes';
import { ampSkin, hasTube } from '@/lib/ampSkins';
import { ModuleIcon } from './ModuleIcon';
import { useI18n } from './I18n';
import { modelValue, parseModelValue, profileChoices } from '@/lib/ampChoices';

interface Props {
  preset: Preset;
  block: Block;
  editable: boolean;
  onEdit: (edit: Edit) => void;
  irNames: readonly (string | null)[] | null;
  profileNames: readonly (string | null)[] | null;
  /** Whether a parameter (by alg) differs from the restore point. */
  paramDirty?: (alg: number, value: number) => boolean;
}

const SINGLE_MODEL = new Set(['nr']);

/** The selected block: model, on/off, every parameter as a knob, switch or list. */
export function ModuleEditor({ preset, block, editable, onEdit, irNames, profileNames, paramDirty }: Props) {
  const { t, lang } = useI18n();
  const notes = useSlotNotes();
  // The pedal's own name (what its screen shows), and what it is in plain words beside it.
  const option = (m: ModelSpec, value: string): PickerOption => {
    const g = modelGuide(block.key, m.name);
    if (g?.group === 'userIr') {
      // A user IR: the file name on the pedal, and the owner's comment (or which slot it is).
      const slot = Number(m.name.replace(/\D/g, '')) - 1;
      const name = irNames?.[slot] ?? m.name;
      return { value, name, detail: noteFor(notes, 'ir', slot, irNames?.[slot]) ?? t('block.irSlot', { n: slot + 1 }) };
    }
    return { value, name: modelLabel(block.key, m.code, m.name, irNames), detail: g?.label[lang] };
  };
  const modelGroups = (value: (m: ModelSpec) => string): PickerGroup[] => {
    const groups = groupModels(block.key, choices, lang);
    return groups.map((g) => ({ name: groups.length === 1 ? null : (g.name ?? t('block.otherModels')), options: g.models.map((m) => option(m, value(m))) }));
  };
  const model = modelOf(preset, block);
  const guide = model ? modelGuide(block.key, model.name) : undefined;
  const clone = block.key === 'amp' && preset.ampMode === 'clone';
  const skin = block.key === 'amp' && !clone ? ampSkin(model?.name) : null;
  const choices = SINGLE_MODEL.has(block.key) ? [] : modelsFor(block.key);
  const profiles = block.key === 'amp' ? profileChoices(profileNames) : [];
  const shown = blockModelLabel(block, preset.ampMode, irNames, profileNames);
  const info = model && !clone ? modelInfo(block.key, model.name) : undefined;
  const send = (alg: number, input: number | boolean | string) => {
    const spec = paramSpecFor(preset, block, alg);
    if (spec) onEdit({ kind: 'param', module: block.module, alg, value: encodeValue(spec, input) });
  };

  return (
    <section className={`editor block-${block.key}${block.on ? '' : ' editor-off'}`} aria-label={t('editor.aria', { block: block.label })}>
      <header className="editor-head">
        <ModuleIcon blockKey={block.key} size={36} />
        <span className="editor-label">{block.label}</span>
        {editable && block.key === 'amp' ? (
          <ModelPicker
            ariaLabel={t('block.modelAria', { block: block.label })}
            value={modelValue(block.code, clone)}
            onChange={(v) => {
              const choice = parseModelValue(v);
              if (choice) onEdit({ kind: 'model', module: block.module, code: choice.code, clone: choice.clone });
            }}
            groups={[
              ...(clone && shown === block.model ? [{ name: null, options: [{ value: modelValue(block.code, true), name: t('block.captured', { model: block.model }), disabled: true }] }] : []),
              ...modelGroups((m) => modelValue(m.code, false)),
              ...(profiles.length > 0
                ? [
                    {
                      name: t('block.profiles'),
                      options: profiles.map((p) => ({ value: modelValue(p.code, true), name: p.name, detail: noteFor(notes, 'profile', p.slot - 1, p.name) ?? t('block.profileSlot', { n: p.slot }) })),
                    },
                  ]
                : []),
            ]}
          />
        ) : editable && choices.length > 0 ? (
          <ModelPicker
            ariaLabel={t('block.modelAria', { block: block.label })}
            value={String(block.code)}
            onChange={(v) => onEdit({ kind: 'model', module: block.module, code: Number(v) })}
            groups={modelGroups((m) => String(m.code))}
          />
        ) : (
          <span className="editor-model editor-model-static">{shown}</span>
        )}
        <span className="editor-end">
          <button
            type="button"
            role="switch"
            aria-checked={block.on}
            aria-label={t(block.on ? 'block.onAria' : 'block.offAria', { block: block.label })}
            className={`switch${block.on ? ' switch-on' : ''}`}
            disabled={!editable}
            onClick={() => onEdit({ kind: 'on', module: block.module, on: !block.on })}
          >
            <span className="switch-knob" />
          </button>
        </span>
      </header>
      <div className={`editor-face face-${block.key}`} data-skin={skin ?? undefined}>
        {block.key === 'amp' && <AmpDecor on={block.on} drive={gainOf(block)} tubeKey={block.code} tube={hasTube(skin)} />}
        {block.params.length === 0 ? (
          <p className="muted small">{t('block.noParams')}</p>
        ) : (
          <div className={block.key === 'amp' ? 'ws-face-row' : 'ws-face-row has-visual'}>
            {/* Beside the knobs: the block's gear drawing and model (the AMP has its faceplate). */}
            {block.key !== 'amp' && (
              <div className="ws-face-visual">
                <RigIcon spec={rigIconSpec(pmRigCategory(block, preset.ampMode), `${block.key}:${block.code}`, block.params.length, block.model)} size={96} />
                <span className="ws-face-model">{shown}</span>
              </div>
            )}
            <div className="editor-params">
              {block.params.map((p) => {
                const spec = paramSpecFor(preset, block, p.alg);
                const dirty = paramDirty?.(p.alg, p.value) ?? false;
                if (p.kind === 'number' && spec) {
                  return (
                    <Knob
                      key={p.alg}
                      label={p.name}
                      value={p.value}
                      min={p.min ?? 0}
                      max={p.max ?? 100}
                      step={spec.step ?? 1}
                      display={p.display}
                      defaultValue={spec.default}
                      disabled={!editable}
                      dirty={dirty}
                      onChange={(v) => send(p.alg, v)}
                    />
                  );
                }
                if (p.kind === 'switch') {
                  const on = p.value >= 0.5;
                  return (
                    <div key={p.alg} className={`editor-toggle${dirty ? ' is-dirty' : ''}`}>
                      {dirty && <DirtyMark />}
                      <span className="knob-value" aria-hidden="true">
                        {on ? t('block.on') : t('block.off')}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={p.name}
                        className={`switch${on ? ' switch-on' : ''}`}
                        disabled={!editable || !spec}
                        onClick={() => send(p.alg, !on)}
                      >
                        <span className="switch-knob" />
                      </button>
                      <span className="knob-label">{p.name}</span>
                    </div>
                  );
                }
                return (
                  <div key={p.alg} className={`editor-toggle${dirty ? ' is-dirty' : ''}`}>
                    {dirty && <DirtyMark />}
                    <span className="knob-value" aria-hidden="true">
                      {p.display}
                    </span>
                    <select className="param-select" aria-label={p.name} value={Math.round(p.value)} disabled={!editable || !spec} onChange={(e) => send(p.alg, Number(e.target.value))}>
                      {spec?.options?.map((o, i) => (
                        <option key={o} value={i}>
                          {o}
                        </option>
                      ))}
                    </select>
                    <span className="knob-label">{p.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {block.key === 'amp' && guide && info?.basedOn && <p className="amp-script">{t('editor.basedOn', { gear: guide.label[lang] })}</p>}
        {(info?.basedOn || info?.about) &&
          (() => {
            // The AMP's faceplate already signs "Based on …"; the line below then only describes it.
            const basedOn = block.key === 'amp' && guide ? undefined : info.basedOn;
            return (
              <p className="editor-info">
                {basedOn ? t('editor.basedOn', { gear: basedOn }) : ''}
                {basedOn && info.about ? ' · ' : ''}
                {lang === 'pt' && guide ? guide.aboutPt : info.about}
              </p>
            );
          })()}
      </div>
    </section>
  );
}

/** The amp's gain as 0..1, for how hot the tube glows; middle when the model has no gain knob. */
function gainOf(block: Block): number {
  const gain = block.params.find((p) => /gain/i.test(p.name) && p.kind === 'number');
  if (!gain || gain.max === undefined || gain.min === undefined || gain.max === gain.min) return 0.5;
  return (gain.value - gain.min) / (gain.max - gain.min);
}
