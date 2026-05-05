import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { PostHogProvider } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Throughline — research synthesis for solo PMs and UX researchers',
  description:
    'Upload interview transcripts. Get themes, quotes, and cross-study synthesis. $19/mo.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-white text-slate-900 antialiased">
          <PostHogProvider>{children}</PostHogProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
