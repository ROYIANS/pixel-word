import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '像素物语 · Pixel Tales',
  description: '每件小东西，都藏着一句话 — 108 条像素物件文案',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;700&family=DotGothic16&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
