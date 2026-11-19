import { FlagValues as FlagValuesScript } from 'flags/react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { getConfig } from '@/lib/config';
import { getFlagValues } from '@/lib/flags';
import { getBaseUrl } from '@/lib/get-base-url';
import { Providers } from './Providers';
import '@umami/react-zen/styles.full.css';
import './global.css';

/** Same key Zen reads (`theme`). Runs before paint so the canvas is never the light default. */
const themeBoot = `(function(){try{var stored=localStorage.getItem('theme');var theme=stored==='light'||stored==='dark'?stored:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var root=document.documentElement;root.setAttribute('data-theme',theme);root.style.colorScheme=theme;if(theme==='dark')root.classList.add('dark');else root.classList.remove('dark');var dark=theme!=='light';var bg=dark?'#141414':'#fcfcfc';var fg=dark?'#f5f5f5':'#1c1c1c';root.style.backgroundColor=bg;root.style.color=fg;var scheme=document.querySelector('meta[name="color-scheme"]');if(scheme)scheme.setAttribute('content',theme);var bar=document.querySelector('meta[name="theme-color"]');if(bar)bar.setAttribute('content',bg);}catch(e){}})();`;

export default async function ({ children }) {
  if (process.env.DISABLE_UI) {
    return (
      <html lang="en" data-theme="dark" className="dark" style={{ backgroundColor: '#141414', colorScheme: 'dark' }}>
        <body></body>
      </html>
    );
  }

  // Force request-time rendering so config reflects runtime env, not build-time env.
  await connection();

  const config = getConfig();
  const flags = await getFlagValues();

  return (
    <html
      lang="en"
      data-theme="dark"
      className="dark"
      style={{ backgroundColor: '#141414', colorScheme: 'dark' }}
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#141414" />
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" crossOrigin="use-credentials" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5" />
        <meta name="msapplication-TileColor" content="#141414" />
        <meta name="robots" content="noindex,nofollow" />
      </head>
      <body suppressHydrationWarning>
        <Suspense>
          <Providers config={config} flags={flags}>
            {children}
          </Providers>
        </Suspense>
        <FlagValuesScript values={flags} />
      </body>
    </html>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();

  return {
    metadataBase: getBaseUrl(headerStore),
    title: {
      template: '%s | Stellog',
      default: 'Stellog',
    },
  };
}
