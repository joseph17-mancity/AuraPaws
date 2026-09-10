import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AuraPaws — Veterinary Welfare Monitoring',
  description:
    'Automated welfare monitoring system that processes real-time acoustic and vision telemetry to detect non-verbal animal distress.',
  openGraph: {
    title: 'AuraPaws — Veterinary Welfare Monitoring',
    description:
      'Automated welfare monitoring system that processes real-time acoustic and vision telemetry to detect non-verbal animal distress.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
