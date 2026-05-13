import type { Metadata } from 'next';
import { Inter, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { PostHogProvider } from './providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument-serif',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Throughline — research synthesis for solo PMs and UX researchers',
  description:
    'Upload interview transcripts. Get themes, quotes, and cross-study synthesis. $19/mo.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${inter.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}
      >
        <body className="min-h-screen">
          <PostHogProvider>{children}</PostHogProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
