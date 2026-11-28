/**
 * WCAG contrast of text drawn over gradients and textures, which axe cannot measure: the text's
 * colour against the background pixels behind it, read from a screenshot taken with the text
 * hidden. Reports the 10th-percentile ratio, so a few grain pixels do not decide it.
 */
import type { Locator, Page } from '@playwright/test';

export interface ContrastResult {
  readonly text: string;
  readonly ratio: number;
  readonly required: number;
}

const luminance = ([r, g, b]: number[]) => {
  const c = [r!, g!, b!].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};

const PROBE_CSS = '[data-contrast-probe], [data-contrast-probe] * { color: transparent !important; text-shadow: none !important; }';

/**
 * The 10th-percentile contrast of a text luminance against the PNG's pixels, computed in the page on
 * the typed pixel buffer. No per-pixel JS arrays: a pass over a dozen elements stays cheap even when
 * many workers share the CPU (the old version built millions of small arrays and starved the others).
 */
async function percentile10(page: Page, png: Buffer, text: number): Promise<number> {
  return page.evaluate(
    async ({ b64, text }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      const lin = Float64Array.from({ length: 256 }, (_, i) => (i / 255 <= 0.03928 ? i / 255 / 12.92 : ((i / 255 + 0.055) / 1.055) ** 2.4));
      const ratios = new Float64Array(d.length / 4);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) {
        const l = 0.2126 * lin[d[i]!]! + 0.7152 * lin[d[i + 1]!]! + 0.0722 * lin[d[i + 2]!]!;
        ratios[j] = (Math.max(text, l) + 0.05) / (Math.min(text, l) + 0.05);
      }
      ratios.sort();
      return ratios[Math.floor(ratios.length * 0.1)]!;
    },
    { b64: png.toString('base64'), text },
  );
}

export async function measure(page: Page, el: Locator): Promise<ContrastResult | null> {
  if (!(await el.isVisible())) return null;
  const style = await el.evaluate((e) => {
    const s = getComputedStyle(e);
    const px = parseFloat(s.fontSize);
    const bold = Number(s.fontWeight) >= 700;
    // Any CSS colour syntax (color-mix, color(srgb …)) to 0..255 RGB, through a canvas pixel.
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = s.color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return { color: [r!, g!, b!], large: px >= 24 || (bold && px >= 18.66), text: (e.textContent ?? '').trim() };
  });
  if (!style) return null;
  // Hide the text of the element and of its children (which may set their own colour); the rule is added once per page.
  await page.evaluate((css) => {
    if (document.getElementById('contrast-probe-style')) return;
    document.head.append(Object.assign(document.createElement('style'), { id: 'contrast-probe-style', textContent: css }));
  }, PROBE_CSS);
  // In the middle of the screen, so a sticky bar (the app bar) never covers what is photographed.
  await el.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await el.evaluate((e) => e.setAttribute('data-contrast-probe', ''));
  const shot = await el.screenshot({ animations: 'disabled' });
  await el.evaluate((e) => e.removeAttribute('data-contrast-probe'));
  return { text: style.text, ratio: await percentile10(page, shot, luminance(style.color)), required: style.large ? 3 : 4.5 };
}
