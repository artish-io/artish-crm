import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Artish CRM',
  robots: { index: false, follow: false },
};

// Runs before first paint so the page never flashes the wrong theme. 'system' (or nothing saved) follows the OS.
const THEME_SCRIPT = `try{var t=localStorage.getItem('crm_theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
