import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Workforce Ops — Admin',
  description: 'Ops console for the workforce operations sync demo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-mono">{children}</body>
    </html>
  );
}
