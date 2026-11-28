'use client';

import { useI18n } from '../I18n';

/** The amber dot on a control whose value differs from what the pedal stores. */
export function DirtyMark() {
  const { t } = useI18n();
  return <span className="ws-param-dirty" role="img" aria-label={t('ws.paramEdited')} title={t('ws.paramEdited')} />;
}
