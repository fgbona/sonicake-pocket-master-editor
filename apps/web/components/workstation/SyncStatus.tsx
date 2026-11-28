'use client';

import type { DeviceView } from '@/lib/workstation/device';
import { useI18n } from '../I18n';

/** The preset's sync chip: in sync with the pedal, edited and not stored, or reading/sending. */
export function SyncStatus({ device }: { device: DeviceView }) {
  const { t } = useI18n();
  return (
    <p className={`ws-sync ws-sync-${device.sync}`} role="status" data-sync={device.sync}>
      <span className="ws-sync-dot" aria-hidden="true" />
      {t(`ws.sync.${device.sync}`, { slot: device.slot })}
    </p>
  );
}
