import type { Metadata } from 'next';
import { Lora, Inter, Geist_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { PostHogProvider } from './providers';
import './globals.css';

// Display serif. Variable font; spec uses weight 400 with 400-700 available
// if more weights are needed downstream.
const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
  display: 'swap',
});

// UI sans. Variable. Used weights per the type spec: ExtraLight 200,
// Light 300, Regular 400, Medium 500.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Code mono. Variable. Spec calls for weight 400 with mono ligatures off
// (handled at the CSS class level via `font-variant-ligatures: none`).
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Throughline. Research synthesis for solo PMs and UX researchers.',
  description:
    'Upload interview transcripts. Get themes, quotes, and cross-study synthesis. $19/mo.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${inter.variable} ${lora.variable} ${geistMono.variable}`}
      >
        <body className="min-h-screen">
          <PostHogProvider>{children}</PostHogProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
