'use client';

import { useState } from 'react';
import type { Tone, ToneModel } from '@pocket-master/core';
import { type CloneSource, firstEmptyClone } from '@/lib/cloneSource';
import { cloneNameFromTitle, TONE_GEARS } from '@/lib/toneSearch';
import type { useTone3000 } from '@/lib/useTone3000';
import type { Matribox } from '@/lib/useMatribox';
import { useI18n } from './I18n';

interface Props {
  mb: Matribox;
  t3k: ReturnType<typeof useTone3000>;
  /** Hands a capture to the Clones panel, which converts it and asks the person to confirm the write. */
  onLoad: (slot: number, name: string, source: CloneSource) => void;
}

/** Manual TONE3000 search (signed in only): results load into a CLONE slot through the Clones panel. */
export function MatriboxToneSearch({ mb, t3k, onLoad }: Props) {
  const { t, te } = useI18n();
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<'nam' | 'ir'>('nam');
  const [gear, setGear] = useState('');
  const [choosing, setChoosing] = useState<{ tone: Tone; models: readonly ToneModel[] } | null>(null);
  const [preparing, setPreparing] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  if (!t3k.configured || !t3k.signedIn) return null;

  const run = (page = 1) => void t3k.search(query.trim(), format, page, gear ? [gear] : undefined);
  const propose = (tone: Tone, modelId?: number) => {
    setChoosing(null);
    onLoad(firstEmptyClone(mb.unit?.cloneNames ?? []), cloneNameFromTitle(tone.title) || 'Clone', { toneId: tone.id, modelId });
  };
  const load = async (tone: Tone) => {
    setProblem(null);
    setPreparing(tone.id);
    try {
      const models = await t3k.models(tone.id);
      if (models.length === 0) throw new Error(t('t3k.noModels'));
      if (models.length === 1) propose(tone, models[0]?.id);
      else setChoosing({ tone, models });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setPreparing(null);
    }
  };

  const results = t3k.results;
  const error = problem ?? t3k.error;
  return (
    <section className="panel t3k t3k-search-panel" aria-label={t('mbSearch.title')}>
      <div className="panel-head">
        <h2>{t('mbSearch.title')}</h2>
      </div>
      <div className="t3k-body">
        <form
          className="t3k-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) run();
          }}
        >
          <input type="search" value={query} placeholder={t('t3k.placeholder')} aria-label={t('mbSearch.query')} onChange={(e) => setQuery(e.target.value)} />
          <select value={format} aria-label={t('mbSearch.platform')} onChange={(e) => setFormat(e.target.value as 'nam' | 'ir')}>
            <option value="nam">{t('t3k.formatNam')}</option>
            <option value="ir">{t('t3k.formatIr')}</option>
          </select>
          <select value={gear} aria-label={t('mbSearch.gear')} onChange={(e) => setGear(e.target.value)}>
            <option value="">{t('mbSearch.anyGear')}</option>
            {TONE_GEARS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary" disabled={t3k.searching || !query.trim()}>
            {t3k.searching ? '…' : t('t3k.search')}
          </button>
        </form>
        {format === 'ir' && <p className="muted small">{t('mbSearch.irNote')}</p>}
        {results && results.tones.length === 0 && <p className="muted small">{t('t3k.noResults')}</p>}
        {results && results.tones.length > 0 && (
          <ul className="t3k-results" aria-label={t('mbSearch.results')}>
            {results.tones.map((tone) => (
              <li key={tone.id} className="t3k-tone">
                {tone.image ? <img src={tone.image} alt="" className="t3k-image" loading="lazy" /> : <span className="t3k-image" aria-hidden="true" />}
                <div className="t3k-info">
                  <strong>{tone.title}</strong>
                  <span className="muted small">
                    {t('t3k.by', { creator: tone.creator })} · {tone.gear || '—'} · {tone.format.toUpperCase()} · {t('t3k.models', { count: tone.modelsCount })} ·{' '}
                    {t('t3k.downloads', { count: tone.downloads })}
                  </span>
                  <a className="small" href={tone.url} target="_blank" rel="noreferrer">
                    {t('t3k.view')}
                  </a>
                  {choosing?.tone.id === tone.id && (
                    <div className="t3k-models" role="group" aria-label={t('mbSearch.pickModel')}>
                      {choosing.models.map((m) => (
                        <button key={m.id} type="button" className="btn btn-small" onClick={() => propose(tone, m.id)}>
                          {m.size ? `${m.name} (${m.size})` : m.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {tone.format === 'ir' ? (
                  <span className="muted small">{t('mbSearch.irOnly')}</span>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    disabled={mb.busy !== null || preparing !== null || tone.modelsCount === 0}
                    aria-label={t('mbSearch.loadAria', { title: tone.title })}
                    onClick={() => void load(tone)}
                  >
                    {preparing === tone.id ? '…' : t('mbSearch.load')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {results && results.page < results.totalPages && (
          <button type="button" className="btn btn-small" disabled={t3k.searching} onClick={() => run(results.page + 1)}>
            {t('t3k.more')}
          </button>
        )}
        {error && (
          <p className="alert" role="alert">
            {te(error)}
          </p>
        )}
      </div>
    </section>
  );
}
