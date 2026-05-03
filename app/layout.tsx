import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { MobileGate } from '@/components/MobileGate';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hyper98',
  description: 'Trade Hyperliquid like it\'s 1998.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <MobileGate />
        <Analytics />
      </body>
    </html>
  );
}
