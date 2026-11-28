'use client';

import type { MbResolvedBlock } from '@pocket-master/core';
import { compressorCurve, delayTaps, eqCurve, gateThreshold, isGate, reverbEnvelope, unitPath, type Point } from '@/lib/blockViz';
import { mbLookKey } from '@/lib/matriboxLook';
import { useI18n } from '../I18n';

const W = 280;
const H = 104;
const PAD = 10;
const x = (u: number) => PAD + u * (W - 2 * PAD);
const y = (u: number) => H - PAD - u * (H - 2 * PAD);

/** Faint grid: four columns and rows, like the unit's display. */
function Grid() {
  return (
    <g className="viz-grid">
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <line x1={x(i / 4)} x2={x(i / 4)} y1={y(0)} y2={y(1)} />
          <line x1={x(0)} x2={x(1)} y1={y(i / 4)} y2={y(i / 4)} />
        </g>
      ))}
    </g>
  );
}

const trace = (pts: readonly Point[]) => unitPath(pts, W, H, PAD);

function Body({ block, look }: { block: MbResolvedBlock; look: string }) {
  const { t } = useI18n();
  if (look === 'dyn' && isGate(block)) {
    const th = gateThreshold(block);
    return (
      <>
        <rect className="viz-muted" x={x(0)} y={y(th)} width={x(1) - x(0)} height={y(0) - y(th)} />
        <line className="viz-trace" x1={x(0)} x2={x(1)} y1={y(th)} y2={y(th)} />
      </>
    );
  }
  if (look === 'dyn' && block.model?.type === 'Comp') {
    const { knee, points } = compressorCurve(block);
    return (
      <>
        <path
          className="viz-dim"
          d={trace([
            [0, 0],
            [1, 1],
          ])}
        />
        <path className="viz-trace" d={trace(points)} />
        <circle className="viz-dot" cx={x(knee[0])} cy={y(knee[1])} r={3.5} />
      </>
    );
  }
  if (look === 'dly') {
    const { taps, mix, synced } = delayTaps(block);
    return (
      <>
        <line className="viz-dim" x1={x(0.04)} x2={x(0.04)} y1={y(0)} y2={y(1)} style={{ opacity: 0.4 + 0.6 * (1 - mix) }} />
        {taps.map(([tx, h], i) => (
          <line key={i} className="viz-trace" x1={x(tx)} x2={x(tx)} y1={y(0)} y2={y(h)} style={{ opacity: 0.35 + 0.65 * mix }} />
        ))}
        <rect className="viz-dim" x={x(0)} y={y(0) + 3} width={(x(1) - x(0)) * mix} height={2} />
        {synced && (
          <text className="viz-text" x={x(1)} y={y(1) + 8} textAnchor="end">
            {t('viz.sync')}
          </text>
        )}
      </>
    );
  }
  if (look === 'rvb') {
    const { points } = reverbEnvelope(block);
    return <path className="viz-trace" d={trace(points)} />;
  }
  if (look === 'eq') {
    return (
      <>
        <line className="viz-dim" x1={x(0)} x2={x(1)} y1={y(0.5)} y2={y(0.5)} />
        <path className="viz-trace" d={trace(eqCurve(block))} />
      </>
    );
  }
  return null;
}

/** Whether BlockScreen draws something for this block (gates, compressors, delays, reverbs, EQs). */
export function blockHasScreen(block: MbResolvedBlock): boolean {
  const key = mbLookKey(block);
  return block.model !== null && (key === 'dyn' ? isGate(block) || block.model?.type === 'Comp' : ['dly', 'rvb', 'eq'].includes(key));
}

/** The block's live "screen": a small display that redraws from its parameters; nothing for other modules. */
export function BlockScreen({ block }: { block: MbResolvedBlock }) {
  const key = mbLookKey(block);
  if (!blockHasScreen(block)) return null;
  return (
    <svg className="viz-screen" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      <Grid />
      <Body block={block} look={key} />
    </svg>
  );
}
