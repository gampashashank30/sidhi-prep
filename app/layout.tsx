import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Siddhi — Question Bank PDF Generator',
  description: 'Upload your DOCX question bank and generate a beautifully designed, customized PDF in minutes.',
  keywords: ['question bank', 'PDF generator', 'UPSC', 'competitive exam', 'Siddhi'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">{children}</body>
    </html>
  );
}
