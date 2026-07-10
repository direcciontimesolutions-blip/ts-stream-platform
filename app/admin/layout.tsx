// app/admin/layout.tsx — Admin layout base

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'Admin — Time Solutions Stream',
    template: '%s | Admin TS Stream',
  },
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {children}
    </div>
  )
}
