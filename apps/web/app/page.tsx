'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { BackupsPanel } from '@/components/BackupsPanel';
import { ChainView } from '@/components/ChainView';
import { SaveDialog } from '@/components/SaveDialog';
import { CopyDialog } from '@/components/CopyDialog';
import { SettingsDialog } from '@/components/SettingsDialog';
import { PresetFiles } from '@/components/PresetFiles';
import { PresetLibrary } from '@/components/PresetLibrary';
import { addToLibrary } from '@/lib/presetLibrary';
import { PEDAL_NAMES, presetLabel, TESTED_FIRMWARE, type PresetFile, type ToneHost } from '@pocket-master/core';
import { AssistantPanel } from '@/components/AssistantPanel';
import { pocketMasterAgent } from '@/lib/pocketAgent';
import { useUndoKeys } from '@/lib/useUndoKeys';
import { Dialog } from '@/components/Dialog';
import { PresetSidebar } from '@/components/PresetSidebar';
import { SlotsPanel } from '@/components/SlotsPanel';
import { Tone3000Panel } from '@/components/Tone3000Panel';
import { SysexLog } from '@/components/SysexLog';
import { Toolbar } from '@/components/Toolbar';
import { usePocketMaster } from '@/lib/usePocketMaster';
import { useI18n } from '@/components/I18n';
import { useIsDesktop } from '@/lib/desktop';
import { MatriboxEditor } from '@/components/MatriboxEditor';
import { AiConnectionPanel } from '@/components/AiConnectionPanel';
import { useAiAgent } from '@/lib/aiBridge';
import { SITE_TITLE } from '@/lib/seo';
import { usePocketDevice } from '@/lib/workstation/useDevice';
import { Dock, type DockTab } from '@/components/workstation/Dock';

const STEPS = ['empty.step1', 'empty.step2'] as const;
const LOG_KEY = 'pocket-master-editor.showLog';
// The desktop app grants MIDI itself: there is no permission to give.
const DESKTOP_STEPS = ['empty.step1'] as const;
const APP_NAME = 'OpenSonicX';

export default function EditorPage() {
  const pm = usePocketMaster();
  const device = usePocketDevice(pm);
  const { t, te } = useI18n();
  const desktop = useIsDesktop();
  const [saveOpen, setSaveOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  // The SysEx log is a diagnostic tool: hidden unless asked for, and the choice is remembered.
  const [showLog, setShowLog] = useState(false);
  useEffect(() => {
    try {
      setShowLog(localStorage.getItem(LOG_KEY) === '1');
    } catch {
      // storage blocked: the log stays hidden
    }
  }, []);
  const toggleLog = () => {
    const next = !showLog;
    setShowLog(next);
    try {
      localStorage.setItem(LOG_KEY, next ? '1' : '0');
    } catch {
      // storage blocked: the choice lasts for this page only
    }
  };
  // The global settings are read once asked for (the ⚙ button or their tab), then kept on show.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The tone assistant loads and saves through the same confirmations a person sees.
  const [assistantLoad, setAssistantLoad] = useState<{ index: number; resolve: (loaded: boolean) => void } | null>(null);
  const [proposal, setProposal] = useState<{ target: number; name: string; resolve: (r: 'saved' | 'cancelled') => void } | null>(null);
  const savedRef = useRef(false);
  const { assistantBase, loadPresetNow, loadNames: readNames } = pm;
  const toneHost = useMemo<ToneHost>(
    () => ({
      ...assistantBase,
      selectPreset: async (index) => {
        if (assistantBase.snapshot().modified) {
          const discard = await new Promise<boolean>((resolve) => setAssistantLoad({ index, resolve }));
          if (!discard) return false;
        }
        if (!(await loadPresetNow(index))) throw new Error(`The pedal did not load ${presetLabel(index)}.`);
        return true;
      },
      proposeSave: (target, name) =>
        new Promise((resolve) => {
          savedRef.current = false;
          setProposal({ target, name, resolve });
          setSaveOpen(true);
          void readNames();
        }),
    }),
    [assistantBase, loadPresetNow, readNames],
  );
  const toneAgent = useMemo(() => pocketMasterAgent(toneHost), [toneHost]);
  const hasPreset = pm.preset !== null;
  const closeSave = () => {
    setSaveOpen(false);
    proposal?.resolve(savedRef.current ? 'saved' : 'cancelled');
    setProposal(null);
  };
  // A preset file waiting for the import confirmation, picked from disk or from the library.
  const [importing, setImporting] = useState<PresetFile | null>(null);
  const importPreset = async (file: PresetFile) => {
    const ok = await pm.importPreset(file);
    if (ok) addToLibrary(file);
    return ok;
  };
  const linked = pm.status === 'connected' || pm.status === 'reading';
  // The Matribox II Pro has its own editor; everything below is the Pocket Master's.
  const matribox = linked && pm.pedal === 'matribox' ? pm.matribox : null;
  const connected = linked && !matribox;
  // The desktop app's AI connection drives the same assistant tools once a preset is read.
  useAiAgent('pocket', connected && hasPreset ? toneAgent : null);
  // The Matribox editor has its own Undo (MatriboxEditor).
  useUndoKeys(pm.undo, pm.redo, !matribox);
  // The window (and the desktop app's title bar) names the connected pedal.
  const pedalName = linked && pm.pedal ? PEDAL_NAMES[pm.pedal] : null;
  // The sidebar lists every preset: read the names once the pedal is connected.
  const { names, loadNames } = pm;
  useEffect(() => {
    if (connected && names === null) void loadNames();
  }, [connected, names, loadNames]);
  // The workstation shell: once a preset is read, the chain and its block fill the screen and the rest sits in the dock.
  const shell = connected && pm.preset !== null;
  const [dock, setDock] = useState<string | null>(null);
  // A preset file picked anywhere (Backups, the library) is confirmed in the Library tab: show it.
  useEffect(() => {
    if (importing) setDock('ws-library');
  }, [importing]);
  const presetFiles = pm.preset && (
    <PresetFiles
      connected={connected}
      current={pm.preset}
      busy={pm.busy}
      error={pm.error}
      pending={importing}
      onPick={setImporting}
      onExport={pm.exportPreset}
      onImport={importPreset}
      onError={pm.showError}
    />
  );
  const backups = (
    <>
      <BackupsPanel
        backups={pm.backups}
        connected={connected}
        busy={pm.busy}
        error={pm.error}
        flowBackups={pm.flowBackups}
        storageWarning={pm.storageWarning}
        onDownload={pm.downloadBackup}
        onImport={pm.importBackup}
        onDelete={pm.deleteBackup}
        onPreset={(file) => {
          pm.clearError();
          setImporting(file);
        }}
        onRestore={pm.restore}
        onBackupAll={pm.backupAll}
        onRestoreAll={pm.restoreAll}
      />
      <AiConnectionPanel />
      {showLog && <SysexLog log={pm.log} onClear={pm.clearLog} />}
      <p className="page-tools">
        <button type="button" className="btn-link" onClick={toggleLog}>
          {t(showLog ? 'log.hide' : 'log.show')}
        </button>
      </p>
    </>
  );
  // Without a connected pedal only the files and the backups show, one after the other.
  const dockTabs: DockTab[] = connected
    ? [
        ...(pm.preset ? [{ id: 'ws-assistant', label: 'ws.rack.assistant', content: <AssistantPanel agent={toneAgent} /> } as const] : []),
        {
          id: 'ws-clones',
          label: 'ws.rack.clones',
          content: (
            <>
              <Tone3000Panel connected={connected} busy={pm.busy !== null} irNames={pm.irNames} profileNames={pm.profileNames} exclusive={pm.exclusive} error={pm.error} />
              <SlotsPanel connected={connected} busy={pm.busy !== null} irNames={pm.irNames} profileNames={pm.profileNames} exclusive={pm.exclusive} error={pm.error} />
            </>
          ),
        },
        {
          id: 'ws-library',
          label: 'ws.rack.library',
          content: (
            <>
              {presetFiles}
              <PresetLibrary
                disabled={pm.busy !== null || !pm.preset}
                onLoad={(file) => {
                  pm.clearError();
                  setImporting(file);
                }}
              />
            </>
          ),
        },
        { id: 'ws-backups', label: 'ws.rack.backups', content: backups },
        {
          id: 'ws-global',
          label: 'ws.rack.global',
          content: (
            <SettingsDialog
              inline
              open={settingsOpen}
              onOpen={() => setSettingsOpen(true)}
              firmware={pm.firmware}
              onClose={() => {
                setSettingsOpen(false);
                setDock(null);
              }}
              exclusive={pm.exclusive}
              writeGlobal={pm.writeGlobal}
              busy={pm.busy !== null}
              error={pm.error}
              factoryReset={pm.factoryReset}
              onReset={pm.reconnect}
            />
          ),
        },
      ]
    : [
        { id: 'ws-library', label: 'ws.rack.library', content: presetFiles },
        { id: 'ws-backups', label: 'ws.rack.backups', content: backups },
      ];
  return (
    <>
      {/* React puts it in the head. It is the page's only <title> (a title in layout.tsx would come first and hide it); the exported HTML carries the search title. */}
      <title>{pedalName ? `${APP_NAME} · ${pedalName}` : SITE_TITLE}</title>
      <Toolbar
        status={pm.status}
        transport={pm.transport}
        pedal={pm.pedal}
        midiRefused={pm.midiRefused}
        onEnable={() => void pm.enable()}
        onRead={pm.read}
        modified={pm.modified}
        onRevert={pm.revert}
        onUndo={pm.undo}
        onRedo={pm.redo}
        canUndo={pm.canUndo}
        canRedo={pm.canRedo}
        onSave={() => {
          pm.clearError();
          setSaveOpen(true);
          void pm.loadNames();
        }}
        onCopy={() => {
          pm.clearError();
          setCopyOpen(true);
          void pm.loadNames();
        }}
        tuner={pm.tuner}
        onTuner={pm.setTuner}
        busy={pm.busy !== null}
        canSave={pm.preset !== null}
        onSettings={() => {
          pm.clearError();
          setSettingsOpen(true);
          setDock('ws-global');
          requestAnimationFrame(() => document.getElementById('ws-global')?.scrollIntoView({ block: 'start' }));
        }}
        onBluetooth={pm.connectBle}
        matribox={matribox !== null}
      />
      {matribox ? (
        <>
          {pm.error && (
            <p className="alert" role="alert">
              {te(pm.error)}
            </p>
          )}
          <MatriboxEditor port={matribox} footer={<AiConnectionPanel />} />
        </>
      ) : (
        <div className={shell ? 'layout ws-shell' : connected ? 'layout' : 'layout layout-single'}>
          {connected && <PresetSidebar names={pm.names} current={pm.presetIndex} modified={pm.modified} disabled={pm.busy !== null} onReadNames={() => void pm.loadNames()} onLoad={pm.loadPreset} />}
          <main className="main">
            {pm.error && (
              <p className="alert" role="alert">
                {te(pm.error)}
              </p>
            )}
            {connected && pm.firmware && pm.firmware !== TESTED_FIRMWARE && (
              <p className="notice" role="status">
                {t('firmware.untested', { firmware: pm.firmware, tested: TESTED_FIRMWARE })}
              </p>
            )}
            {pm.preset ? (
              <ChainView
                preset={pm.preset}
                presetIndex={pm.presetIndex}
                presetName={pm.presetIndex !== null ? (pm.names?.[pm.presetIndex] ?? null) : null}
                editable={pm.busy === null}
                modified={pm.modified}
                onEdit={pm.edit}
                irNames={pm.irNames}
                profileNames={pm.profileNames}
                device={connected ? device : undefined}
              />
            ) : (
              <section className="empty">
                <h1>{t('empty.title')}</h1>
                <p className="muted">{t('empty.subtitle')}</p>
                <ol className="steps">
                  {(desktop ? DESKTOP_STEPS : STEPS).map((s) => (
                    <li key={s}>{t(s)}</li>
                  ))}
                </ol>
                <p className="muted small">{t(desktop ? 'empty.desktopNote' : 'empty.browsers')}</p>
                <p className="muted small">{t('empty.firmware')}</p>
              </section>
            )}
            {shell ? (
              <Dock
                active={dock}
                onActive={(id) => {
                  // The settings are read the first time their tab opens.
                  if (id === 'ws-global') setSettingsOpen(true);
                  setDock(id);
                }}
                tabs={dockTabs}
              />
            ) : (
              dockTabs.map((tab) => <Fragment key={tab.id}>{tab.content}</Fragment>)
            )}
            <Dialog
              open={assistantLoad !== null}
              title={t('presets.unsavedTitle')}
              onClose={() => {
                assistantLoad?.resolve(false);
                setAssistantLoad(null);
              }}
            >
              <p>{t('presets.unsaved', { current: pm.presetIndex === null ? '' : presetLabel(pm.presetIndex), next: assistantLoad ? presetLabel(assistantLoad.index) : '' })}</p>
              <div className="sheet-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    assistantLoad?.resolve(false);
                    setAssistantLoad(null);
                  }}
                >
                  {t('action.cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    assistantLoad?.resolve(true);
                    setAssistantLoad(null);
                  }}
                >
                  {t('presets.discard')}
                </button>
              </div>
            </Dialog>
            <CopyDialog open={copyOpen} presetIndex={pm.presetIndex} names={pm.names} busy={pm.busy} error={pm.error} onCopy={pm.copyPreset} onClose={() => setCopyOpen(false)} />
            <SaveDialog
              open={saveOpen}
              presetIndex={pm.presetIndex}
              names={pm.names}
              busy={pm.busy}
              error={pm.error}
              flowBackups={pm.flowBackups}
              storageWarning={pm.storageWarning}
              onDownload={pm.downloadBackup}
              onSave={pm.save}
              onClose={closeSave}
              proposal={proposal}
              onSaved={() => {
                savedRef.current = true;
              }}
            />
          </main>
        </div>
      )}
    </>
  );
}
