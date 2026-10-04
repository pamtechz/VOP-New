import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Marketplace Admin Portal',
  description: 'Management & Resource Monitoring Console for Local Multi-Vendor Marketplace',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
