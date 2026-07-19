import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Siddhi — Question Bank PDF Generator',
  description: 'Upload your DOCX question bank and generate a beautifully designed, customized PDF in minutes.',
  keywords: ['question bank', 'PDF generator', 'UPSC', 'competitive exam', 'Siddhi'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
