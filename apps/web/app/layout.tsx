import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Share_Tech_Mono, Yellowtail } from 'next/font/google';
import './globals.css';
import './matribox.css';
import './workstation.css';
import './hardware.css';
import './eq.css';
import './viz.css';
import { I18nProvider } from '@/components/I18n';
import { THEME_BOOT_SCRIPT } from '@/components/ThemeToggle';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_TITLE, softwareApplicationJsonLd } from '@/lib/seo';

/** The script lettering on the amp's faceplate; self-hosted by Next, so it works offline. */
const script = Yellowtail({ weight: '400', subsets: ['latin'], variable: '--font-script', display: 'swap' });
/**
 * The workstation's labels (a condensed technical sans) and its readouts (a fixed-width display face);
 * self-hosted by Next and preloaded; the display's lines do not wrap, so a late font cannot change their height.
 */
const labels = Barlow_Condensed({ weight: ['500', '600', '700'], subsets: ['latin', 'latin-ext'], variable: '--font-label', display: 'swap' });
const readout = Share_Tech_Mono({ weight: '400', subsets: ['latin'], variable: '--font-readout', display: 'swap' });

export const metadata: Metadata = {
  // Link previews and the canonical need absolute URLs: the Pages workflow sets SITE_URL (the origin; Next adds the basePath).
  metadataBase: process.env.SITE_URL ? new URL(process.env.SITE_URL) : undefined,
  // No `title` here: the one page sets it (page.tsx), as it follows the connected pedal.
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  // Next does not add the base path to a relative canonical.
  alternates: { canonical: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/` },
  robots: { index: true, follow: true },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['pt_BR'],
  },
  twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0b0d10' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0d10' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${script.variable} ${labels.variable} ${readout.variable}`} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant script from this code base (no user data), run before the first paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: JSON built from constants in this code base, "<" escaped */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd()).replace(/</g, '\\u003c') }} />
      </head>
      <body>
        {/* Shared paint servers: the chrome of every knob cap (referenced from CSS). */}
        <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
          <defs>
            <radialGradient id="knob-chrome" cx="38%" cy="32%" r="75%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.35" stopColor="#c9ccd1" />
              <stop offset="0.75" stopColor="#7d8188" />
              <stop offset="1" stopColor="#3d4045" />
            </radialGradient>
            {/* The stage theme's dark machined cap. */}
            <radialGradient id="knob-dark" cx="38%" cy="30%" r="78%">
              <stop offset="0" stopColor="#6b717a" />
              <stop offset="0.3" stopColor="#363a40" />
              <stop offset="0.8" stopColor="#17191c" />
              <stop offset="1" stopColor="#0b0c0e" />
            </radialGradient>
          </defs>
        </svg>
        <I18nProvider>
          {children}
          <UpdatePrompt />
        </I18nProvider>
      </body>
    </html>
  );
}
