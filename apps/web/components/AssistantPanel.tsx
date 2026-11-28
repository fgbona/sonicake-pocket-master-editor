'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { Difference } from '@pocket-master/core';
import { forgetKeys, loadKey, loadOrder, loadPaid, loadRemember, loadRotate, maskKey, removeKey, saveKey, saveOrder, savePaid, saveRemember, saveRotate, type PaidEntry } from '@/lib/aiKey';
import { nextReset, recordRequest, usedToday, useAiUsage } from '@/lib/aiUsage';
import {
  ask,
  BusyError,
  KeyError,
  providerOf,
  QuotaError,
  RegionError,
  ROUTE,
  StepLimitError,
  ToolLoopError,
  type AiModel,
  type Converse,
  type Cooldown,
  type Provider,
  type ToneAgent,
  type Turn,
} from '@/lib/assistant';
import { converseGemini, GEMINI_MODELS, testGeminiKey } from '@/lib/gemini';
import { converseGroq, GROQ_MODEL, testGroqKey } from '@/lib/groq';
import { converseWith, PAID, paidById, paidName } from '@/lib/providers';
import { moveInOrder, orderRoute, rotated } from '@/lib/route-order';
import { answerCost, loadPrices, priceOf, type Usage } from '@/lib/prices';
import { recordSpend, spentToday } from '@/lib/spend';
import type { MessageKey } from '@/lib/i18n';
import { Changes, DIFF_KEY } from './PresetFiles';
import { PaidProviders } from './PaidProviders';
import { AnswerOrder } from './AnswerOrder';
import { Markdown } from './Markdown';
import { AssistantBusy } from './AssistantBusy';
import { InfoTip } from './InfoTip';
import { useI18n } from './I18n';

interface Props {
  agent: ToneAgent;
  /** The examples' lead-in; each pedal names its own slots ("save it on P45"). */
  hint?: MessageKey;
  /** What goes to the provider. */
  privacy?: MessageKey;
  /** Pedal-specific options shown at the top of the panel (the Matribox's output choice). */
  options?: ReactNode;
}

interface Message {
  readonly role: 'user' | 'assistant' | 'error';
  readonly text: string;
  readonly changes?: readonly Difference[];
  readonly model?: AiModel;
  /** Estimated US dollars, for a paid provider's answer. */
  readonly cost?: number;
  readonly link?: { readonly href: string; readonly text: string };
}

const REGIONS = 'https://ai.google.dev/gemini-api/docs/available-regions';
const EXAMPLES = ['assistant.example1', 'assistant.example2', 'assistant.example3'] as const;

const FREE_CONVERSE: Readonly<Partial<Record<AiModel, Converse>>> = { groq: converseGroq, flash: converseGemini, lite: converseGemini };
const MODELS: Readonly<Partial<Record<AiModel, { readonly name: string; readonly limit: number; readonly pacificReset: boolean }>>> = {
  groq: { name: 'Groq', limit: GROQ_MODEL.freeDailyLimit, pacificReset: false },
  flash: { name: 'Gemini Flash', limit: GEMINI_MODELS.flash.freeDailyLimit, pacificReset: true },
  lite: { name: 'Gemini Flash-Lite', limit: GEMINI_MODELS.lite.freeDailyLimit, pacificReset: true },
};
const FREE_NAME: Readonly<Partial<Record<Provider, string>>> = { groq: 'Groq', gemini: 'Google Gemini' };
/** A provider's name; a paid one that also has the free setup carries its "(paid)" tag. */
const providerName = (p: Provider, paidTag = '') => FREE_NAME[p] ?? (paidById(p) ? paidName(paidById(p)!, paidTag) : p);

/** How to get each free key; Groq first, since its free quota is the largest. */
const SETUP: readonly {
  readonly provider: 'groq' | 'gemini';
  readonly note: MessageKey;
  readonly link: string;
  readonly linkText: MessageKey;
  readonly steps: readonly MessageKey[];
  readonly label: MessageKey;
  readonly placeholder: string;
  readonly test: (key: string) => Promise<'ok' | 'invalid' | 'unavailable'>;
  readonly usage: string;
}[] = [
  {
    provider: 'groq',
    note: 'assistant.groqNote',
    link: 'https://console.groq.com/keys',
    linkText: 'assistant.openGroq',
    steps: ['assistant.groqStep1', 'assistant.groqStep2', 'assistant.groqStep3'],
    label: 'assistant.groqKeyLabel',
    placeholder: 'gsk_…',
    test: (k) => testGroqKey(k),
    usage: 'https://console.groq.com/settings/limits',
  },
  {
    provider: 'gemini',
    note: 'assistant.geminiNote',
    link: 'https://aistudio.google.com/apikey',
    linkText: 'assistant.openStudio',
    steps: ['assistant.step1', 'assistant.step2', 'assistant.step3'],
    label: 'assistant.keyLabel',
    placeholder: 'AIza…',
    test: (k) => testGeminiKey(k),
    usage: 'https://aistudio.google.com/rate-limit',
  },
];

/** One provider's key: how to get it, or the saved one with a way to remove it. */
function KeySetup({
  setup,
  saved,
  kept,
  onSaved,
  onRemove,
}: {
  setup: (typeof SETUP)[number];
  saved: string | null;
  kept: boolean;
  onSaved: (key: string, kept: boolean) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'testing' | 'invalid' | 'unavailable'>('idle');
  const name = providerName(setup.provider);
  const add = async () => {
    const candidate = input.trim();
    if (!candidate) return;
    setStatus('testing');
    const result = await setup.test(candidate);
    if (result !== 'ok') return setStatus(result);
    const kept = saveKey(setup.provider, candidate);
    setInput('');
    setStatus('idle');
    onSaved(candidate, kept);
  };
  return (
    <section className="assistant-provider" aria-label={t('assistant.providerAria', { provider: name })}>
      <h3>
        {name} <span className="muted small">{t(setup.note)}</span>
      </h3>
      {saved ? (
        <p className="assistant-saved">
          <span>{t(kept ? 'assistant.keySaved' : 'assistant.keyNotKept', { key: maskKey(saved) })}</span>
          <button type="button" className="btn btn-small" onClick={onRemove}>
            {t('assistant.removeKey')}
          </button>
        </p>
      ) : (
        <>
          <ol className="steps assistant-steps">
            {setup.steps.map((s, i) => (
              <li key={s}>
                {t(s)}
                {i === 0 && (
                  <>
                    {' '}
                    <a href={setup.link} target="_blank" rel="noreferrer">
                      {t(setup.linkText)}
                    </a>
                  </>
                )}
              </li>
            ))}
          </ol>
          <form
            className="assistant-key"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <label className="field">
              <span>{t(setup.label)}</span>
              <input type="password" value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off" spellCheck={false} placeholder={setup.placeholder} />
            </label>
            <button type="submit" className="btn btn-primary" disabled={!input.trim() || status === 'testing'}>
              {status === 'testing' ? t('assistant.testing') : t('assistant.saveKey')}
            </button>
          </form>
          {status === 'invalid' && (
            <p className="alert" role="alert">
              {t('assistant.keyInvalid', { provider: name })}
            </p>
          )}
          {status === 'unavailable' && (
            <p className="alert" role="alert">
              {t('assistant.keyUnavailable', { provider: name })}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Chat that builds tones on the pedal from a description, with the person's own free AI keys. */
export function AssistantPanel({ agent, hint = 'assistant.hint', privacy = 'assistant.privacy', options }: Props) {
  const { t, te, lang } = useI18n();
  const [keys, setKeys] = useState<Partial<Record<Provider, string>>>({});
  const [paid, setPaid] = useState<readonly PaidEntry[]>([]);
  const [order, setOrder] = useState<readonly string[]>([]);
  const [rotate, setRotate] = useState(false);
  /** Counts conversations, so rotation starts each new one a provider further. */
  const [round, setRound] = useState(0);
  /** Keys the browser refused to store: they last for this page only. */
  const [notKept, setNotKept] = useState<readonly Provider[]>([]);
  const [managing, setManaging] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [working, setWorking] = useState(false);
  const [cooldown, setCooldown] = useState<Cooldown>({});
  const [limits, setLimits] = useState<Partial<Record<AiModel, { remaining: number; limit: number }>>>({});
  const [remember, setRemember] = useState(true);
  const usage = useAiUsage();
  const warnedKeys = useRef(new Set<Provider>());
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored: Partial<Record<Provider, string>> = {};
    for (const p of ['groq', 'gemini'] as const) {
      const k = loadKey(p);
      if (k) stored[p] = k;
    }
    setKeys(stored);
    setPaid(loadPaid((id) => paidById(id) !== undefined));
    setOrder(loadOrder());
    setRotate(loadRotate());
    setRemember(loadRemember());
  }, []);
  const list = useRef<HTMLOListElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages and working are the triggers (scroll when the conversation changes)
  useEffect(() => {
    // Scroll the conversation to the start of the last question, so a long answer is read from the top.
    const ol = list.current;
    const asked = ol?.querySelectorAll<HTMLElement>('.assistant-message.is-user');
    const last = asked?.[asked.length - 1];
    if (ol && last) ol.scrollTop += last.getBoundingClientRect().top - ol.getBoundingClientRect().top;
    end.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages, working]);

  /** US dollars to two significant digits: US$ 0,0031. */
  const money = (usd: number) => new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 2 }).format(usd);
  const time = (d: Date) => d.toLocaleTimeString(lang === 'pt' ? 'pt-BR' : 'en', { hour: '2-digit', minute: '2-digit' });
  const label = (d: Difference) => (d.what === 'param' ? d.name : t(DIFF_KEY[d.what]));
  const hasKey = Object.keys(keys).length > 0 || paid.length > 0;
  const allKeys: Partial<Record<Provider, string>> = { ...keys, ...Object.fromEntries(paid.map((e) => [e.id, e.key])) };
  // The person's order; by default paid providers first, in the order they were added, then the free models.
  const ordered = orderRoute(
    [...paid.map((e) => e.id), ...ROUTE].filter((m) => allKeys[providerOf(m)]),
    order,
  );
  const route = rotate ? rotated(ordered, round) : ordered;
  const converse: Partial<Record<AiModel, Converse>> = {
    ...FREE_CONVERSE,
    ...Object.fromEntries(paid.map((e) => [e.id, converseWith(paidById(e.id)!, e.model)])),
  };
  // Where the text goes: the providers with a key, by name (all of them before any key is set up).
  const withKey = (Object.keys(allKeys) as Provider[]).map((p) => providerName(p, t('assistant.paidTag')));
  const providers = (withKey.length > 0 ? withKey : [...Object.values(FREE_NAME), ...PAID.map((p) => p.name)]).join(', ');
  // Google's free-plan training note only applies when a Gemini key is in play (or none is set up yet).
  const googleNote = withKey.length === 0 || 'gemini' in allKeys ? ` ${t('assistant.privacyGemini')}` : '';
  /** Each provider's own usage page: the free ones', then the paid ones' (spend and limits). */
  const usageLinks = [
    ...SETUP.filter((s) => keys[s.provider]).map((s) => ({ provider: s.provider as Provider, href: s.usage })),
    ...paid.map((e) => ({ provider: e.id as Provider, href: paidById(e.id)!.limits })),
  ];
  const modelName = (m: AiModel) => MODELS[m]?.name ?? `${providerName(m as Provider, t('assistant.paidTag'))} · ${paid.find((e) => e.id === m)?.model ?? ''}`;

  /** Asked to save, but the model did not propose it: open the Save dialog itself; nothing is written until confirmed. */
  const offerSave = (message: string) => {
    const slot = agent.offerSave(message);
    if (slot !== null) setMessages((m) => [...m, { role: 'assistant', text: t('assistant.saveOpened', { slot }) }]);
  };

  const send = async () => {
    const message = draft.trim();
    if (!message || !hasKey || working) return;
    setDraft('');
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setWorking(true);
    let changed: ReturnType<ToneAgent['watch']> | null = null;
    let proposed = false;
    let loaded = false;
    const used: Partial<Record<AiModel, Usage>> = {};
    /** What each paid provider this message reached cost; kept as today's spend. Undefined when unknown. */
    const settleCosts = async (): Promise<Partial<Record<AiModel, number>>> => {
      const costs: Partial<Record<AiModel, number>> = {};
      const reached = paid.filter((e) => used[e.id]);
      if (reached.length === 0) return costs;
      const prices = await loadPrices();
      for (const e of reached) {
        const cost = answerCost(used[e.id]!, priceOf(prices, e.model));
        if (cost !== null) {
          costs[e.id] = cost;
          recordSpend(e.id, cost);
        }
      }
      return costs;
    };
    try {
      changed = agent.watch(t('assistant.off'));
      const result = await ask({
        keys: allKeys,
        cooldown,
        converse,
        route,
        turns,
        message,
        agent,
        language: lang === 'pt' ? 'Brazilian Portuguese' : 'English',
        onRequest: (model) => recordRequest(model),
        onCooldown: setCooldown,
        onLimits: (model, remaining, limit) => setLimits((l) => ({ ...l, [model]: { remaining, limit } })),
        onModelUsage: (model, input, output, cost) => {
          const u = used[model] ?? { input: 0, output: 0 };
          used[model] = { input: u.input + input, output: u.output + output, ...(cost !== undefined || u.cost !== undefined ? { cost: (u.cost ?? 0) + (cost ?? 0) } : {}) };
        },
        onStep: (tool, ok) => {
          if (tool === 'save_preset') proposed = true;
          if (tool === 'select_preset' && ok) loaded = true;
        },
      });
      setCooldown(result.cooldown);
      const reply = result.reply || '…';
      // A key the provider refused, while another provider answered: say it once, or it fails silently on every message.
      const refused = result.badKeys.filter((p) => !warnedKeys.current.has(p));
      refused.forEach((p) => warnedKeys.current.add(p));
      const costs = await settleCosts();
      setTurns((h) => [...h, { role: 'user', text: message }, { role: 'assistant', text: reply }]);
      setMessages((m) => [
        ...m,
        ...refused.map((p): Message => ({ role: 'error', text: t('assistant.keyRejected', { provider: providerName(p, t('assistant.paidTag')) }) })),
        { role: 'assistant', text: reply, model: result.model, cost: costs[result.model], changes: changed!({ loaded, saved: proposed }) },
      ]);
      if (!proposed) offerSave(message);
    } catch (error) {
      const text =
        error instanceof BusyError && error.partial && error.model
          ? t('assistant.busyPartial', { model: modelName(error.model) })
          : error instanceof QuotaError && error.partial && error.model
            ? t('assistant.quotaPartial', { model: modelName(error.model), time: time(error.retryAt) })
            : error instanceof BusyError
              ? t('assistant.busy', { time: time(error.retryAt) })
              : error instanceof QuotaError
                ? t('assistant.quotaAll', { time: time(error.retryAt) })
                : error instanceof KeyError
                  ? t('assistant.keyRejected', { provider: providerName(error.provider, t('assistant.paidTag')) })
                  : error instanceof RegionError
                    ? t('assistant.region')
                    : error instanceof ToolLoopError
                      ? t('assistant.toolLoop', { tool: error.tool, reason: te(error.reason) })
                      : error instanceof StepLimitError
                        ? t('assistant.stepLimit')
                        : t('assistant.error', { reason: te(error instanceof Error ? error.message : String(error)) });
      // The next answer is told this one was cut, so a model does not lose the request (the preset it gets is current).
      setTurns((h) => [...h, { role: 'user', text: message }, { role: 'assistant', text: `(This answer was interrupted: ${error instanceof Error ? error.message : String(error)})` }]);
      const link = error instanceof RegionError ? { href: REGIONS, text: t('assistant.regionLink') } : undefined;
      setMessages((m) => [...m, { role: 'error', text, link, changes: changed?.({ loaded, saved: proposed }) }]);
      void settleCosts(); // a cut answer was paid for too
      // Cut after the sound changed: the tone is there, so the save that was asked for is still offered.
      if (!proposed && error instanceof QuotaError && error.partial) offerSave(message);
    } finally {
      setWorking(false);
    }
  };

  const now = new Date();
  const usageLine = (model: AiModel) => {
    const info = MODELS[model];
    if (!info) {
      const spent = spentToday(model, now);
      return spent > 0 ? t('assistant.paidSpent', { model: modelName(model), cost: money(spent) }) : t('assistant.paidLine', { model: modelName(model) });
    }
    const until = cooldown[model];
    if (until && until > now) return t('assistant.paused', { model: info.name, time: time(until) });
    const known = limits[model];
    if (known) return t('assistant.left', { model: info.name, remaining: known.remaining, limit: known.limit });
    const used = usedToday(usage, model, now);
    return info.pacificReset ? t('assistant.usedReset', { model: info.name, used, limit: info.limit, time: time(nextReset(now)) }) : t('assistant.used', { model: info.name, used, limit: info.limit });
  };

  return (
    <section className="panel assistant" aria-label={t('assistant.title')}>
      <header className="panel-head">
        <h2>{t('assistant.title')}</h2>
        {hasKey && (
          <div className="assistant-head-actions">
            {!managing && messages.length > 0 && (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setMessages([]);
                  setTurns([]);
                  setRound((r) => r + 1);
                }}
              >
                {t('assistant.new')}
              </button>
            )}
            <button type="button" className="btn btn-small" disabled={working} onClick={() => setManaging(!managing)}>
              {t(managing ? 'assistant.backToChat' : 'assistant.keys')}
            </button>
          </div>
        )}
      </header>
      <div className="assistant-body">
        {options}
        {!hasKey || managing ? (
          <>
            {!hasKey && <p>{t('assistant.intro')}</p>}
            <p className="muted small">
              {t('assistant.setupHint')}
              <InfoTip text={t('assistant.freeInfo')} />
            </p>
            {SETUP.map((s) => (
              <KeySetup
                key={s.provider}
                setup={s}
                saved={keys[s.provider] ?? null}
                kept={!notKept.includes(s.provider)}
                onSaved={(k, kept) => {
                  setKeys((all) => ({ ...all, [s.provider]: k }));
                  setNotKept((list) => (kept ? list.filter((p) => p !== s.provider) : [...list, s.provider]));
                }}
                onRemove={() => {
                  removeKey(s.provider);
                  warnedKeys.current.delete(s.provider);
                  const { [s.provider]: _gone, ...rest } = keys;
                  setKeys(rest);
                  if (Object.keys(rest).length === 0) setManaging(false); // the next key added goes straight to the chat
                }}
              />
            ))}
            <PaidProviders
              entries={paid}
              onChange={(list) => {
                setPaid(list);
                savePaid(list);
                if (list.length === 0 && Object.keys(keys).length === 0) setManaging(false);
              }}
            />
            <AnswerOrder
              order={ordered}
              name={modelName}
              rotate={rotate}
              onMove={(m, delta) => {
                const next = moveInOrder(ordered, m, delta);
                setOrder(next);
                saveOrder(next);
              }}
              onRotate={(on) => {
                setRotate(on);
                saveRotate(on);
              }}
            />
            <div className="assistant-keep">
              <label className="check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => {
                    setRemember(e.target.checked);
                    saveRemember(e.target.checked);
                  }}
                />
                <span>
                  {t('assistant.remember')}
                  <InfoTip text={t('assistant.rememberInfo')} />
                </span>
              </label>
              {hasKey && (
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => {
                    forgetKeys();
                    warnedKeys.current.clear();
                    setKeys({});
                    setPaid([]);
                    setManaging(false);
                  }}
                >
                  {t('assistant.forgetKeys')}
                </button>
              )}
            </div>
            <p className="muted small">
              {t(privacy, { providers })}
              {googleNote}
            </p>
          </>
        ) : (
          <>
            {messages.length === 0 && (
              <div className="assistant-examples">
                <p className="muted">{t(hint)}</p>
                {EXAMPLES.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="btn btn-small"
                    onClick={() => {
                      setDraft(t(k));
                      input.current?.focus();
                    }}
                  >
                    {t(k)}
                  </button>
                ))}
              </div>
            )}
            <ol ref={list} className="assistant-messages" aria-live="polite">
              {messages.map((m, i) => (
                <li key={i} className={`assistant-message is-${m.role}`}>
                  <div>
                    {m.role === 'assistant' ? <Markdown text={m.text} /> : m.text}
                    {m.link && (
                      <>
                        {' '}
                        <a href={m.link.href} target="_blank" rel="noreferrer">
                          {m.link.text}
                        </a>
                      </>
                    )}
                  </div>
                  {m.changes && m.changes.length > 0 && <Changes differences={m.changes} label={label} title={t('assistant.changes')} />}
                  {m.role === 'assistant' && m.changes?.length === 0 && <p className="muted small">{t('assistant.noChanges')}</p>}
                  {m.model && (
                    <p className="muted small assistant-via">
                      {m.cost !== undefined ? t('assistant.viaCost', { model: modelName(m.model), cost: money(m.cost) }) : t('assistant.via', { model: modelName(m.model) })}
                    </p>
                  )}
                </li>
              ))}
              {working && (
                <li className="assistant-message is-assistant">
                  <AssistantBusy />
                </li>
              )}
            </ol>
            <div ref={end} />
            <form
              className="assistant-input"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <input ref={input} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('assistant.placeholder')} aria-label={t('assistant.inputAria')} disabled={working} />
              <button type="submit" className="btn btn-primary" disabled={working || !draft.trim()}>
                {t('assistant.send')}
              </button>
            </form>
            <ul className="muted small assistant-usage">
              {ordered.map((m) => (
                <li key={m}>{usageLine(m)}</li>
              ))}
            </ul>
            <p className="muted small">
              {t('assistant.realUsage')}{' '}
              {usageLinks.map((u, i) => (
                <span key={u.provider}>
                  {i > 0 && ' · '}
                  <a href={u.href} target="_blank" rel="noreferrer">
                    {providerName(u.provider, t('assistant.paidTag'))}
                  </a>
                </span>
              ))}
            </p>
            <p className="muted small">
              {t(privacy, { providers })}
              {googleNote}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
