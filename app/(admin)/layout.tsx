// app/(admin)/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Siddhi Admin — User Management',
  description: 'Admin panel for managing Siddhi Prep users.',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
