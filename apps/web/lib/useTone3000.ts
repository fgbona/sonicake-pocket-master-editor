'use client';

/**
 * TONE3000 in the browser: sign-in with a code approved at tone3000.com (device authorization,
 * so no redirect address has to be registered), search and model download. The publishable key
 * comes from NEXT_PUBLIC_TONE3000_CLIENT_ID at build time; tokens stay in this browser.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadModel, listModels, pollDeviceToken, refreshTokens, searchTones, startDeviceLogin, type DeviceLogin, type TonePage, type ToneModel, type Tokens } from '@pocket-master/core';

const STORE = 'pocket-master-editor.tone3000';
export const TONE3000_CLIENT_ID = process.env.NEXT_PUBLIC_TONE3000_CLIENT_ID ?? '';

function loadTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

function storeTokens(tokens: Tokens | null): void {
  try {
    if (tokens) localStorage.setItem(STORE, JSON.stringify(tokens));
    else localStorage.removeItem(STORE);
  } catch {
    // private mode: the sign-in lasts for this page only
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useTone3000() {
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [login, setLogin] = useState<DeviceLogin | null>(null);
  const [results, setResults] = useState<TonePage | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokensRef = useRef<Tokens | null>(null);
  const cancelled = useRef(false);

  const signingIn = useRef(false);
  const polling = useRef<AbortController | null>(null);

  useEffect(() => {
    cancelled.current = false; // strict mode runs effects twice: undo the first cleanup
    const t = loadTokens();
    tokensRef.current = t;
    setTokens(t);
    return () => {
      cancelled.current = true;
      polling.current?.abort(); // the panel closed: stop asking TONE3000 for the code's approval
    };
  }, []);

  const save = useCallback((t: Tokens | null) => {
    tokensRef.current = t;
    storeTokens(t);
    setTokens(t);
  }, []);

  /** A usable access token, refreshed shortly before it expires. */
  const token = useCallback(async (): Promise<string> => {
    const t = tokensRef.current;
    if (!t) throw new Error('Sign in to TONE3000 first.');
    if (t.expiresAt - Date.now() > 60_000) return t.accessToken;
    if (!t.refreshToken) {
      save(null);
      throw new Error('The TONE3000 sign-in expired; sign in again.');
    }
    try {
      const fresh = await refreshTokens({ clientId: TONE3000_CLIENT_ID, refreshToken: t.refreshToken });
      save(fresh);
      return fresh.accessToken;
    } catch (e) {
      // A network failure keeps the sign-in for the next try; a refused refresh ends it.
      if (e instanceof TypeError) throw new Error('Could not reach TONE3000; check the connection and try again.');
      save(null);
      throw new Error('The TONE3000 sign-in expired; sign in again.');
    }
  }, [save]);

  const signIn = useCallback(async () => {
    if (signingIn.current) return;
    signingIn.current = true;
    setError(null);
    try {
      const start = await startDeviceLogin(TONE3000_CLIENT_ID);
      if (cancelled.current) return;
      setLogin(start);
      polling.current = new AbortController();
      const t = await pollDeviceToken({ clientId: TONE3000_CLIENT_ID, start, signal: polling.current.signal });
      if (!cancelled.current) save(t);
    } catch (e) {
      if (!cancelled.current) setError(message(e));
    } finally {
      signingIn.current = false;
      polling.current = null;
      if (!cancelled.current) setLogin(null);
    }
  }, [save]);

  const signOut = useCallback(() => {
    save(null);
    setResults(null);
  }, [save]);

  const search = useCallback(
    async (query: string, format: 'nam' | 'ir', page = 1, gears?: readonly string[]) => {
      setSearching(true);
      setError(null);
      try {
        setResults(await searchTones(await token(), { query, format, page, gears }));
      } catch (e) {
        setError(message(e));
      } finally {
        setSearching(false);
      }
    },
    [token],
  );

  /** A search that only returns the page (the assistant's), without touching the panel's results. */
  const find = useCallback(async (query: string, format: 'nam' | 'ir', page = 1): Promise<TonePage> => searchTones(await token(), { query, format, page }), [token]);

  const models = useCallback(async (toneId: number): Promise<ToneModel[]> => listModels(await token(), toneId), [token]);
  const download = useCallback(async (url: string): Promise<Uint8Array> => downloadModel(await token(), url), [token]);

  return {
    configured: TONE3000_CLIENT_ID !== '',
    signedIn: tokens !== null,
    login,
    results,
    searching,
    error,
    signIn: () => void signIn(),
    signOut,
    search,
    find,
    models,
    download,
    clearError: () => setError(null),
  };
}
