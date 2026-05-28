import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GearX Repair Quote Review — AH Group',
  description: 'Quote approval portal for AH Group repair requests',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.10.0/dist/tabler-icons.min.css" />
      </head>
      <body>{children}</body>
    </html>
  )
}
