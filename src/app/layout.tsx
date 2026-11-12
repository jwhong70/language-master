import type { Metadata, Viewport } from 'next';
import NextTopLoader from 'nextjs-toploader';
import { Toaster } from 'sonner';
import InstallPrompt from '@/components/InstallPrompt';
import './globals.css';

export const metadata: Metadata = {
  title: 'LANGUAGE MASTER | 어학 마스터 (영어 120과 · 일본어 90과)',
  description:
    '영어 120과 · 일본어 90과 누적 복습 To-Do 진도표 및 문단·문장·반복 섀도잉 트레이닝 웹',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '어학 마스터',
  },
  icons: {
    icon: '/icon-192x192.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#F9F8F6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen bg-[#F9F8F6] text-[#1A1A1A] antialiased selection:bg-[#EA580C]/30 selection:text-amber-950">
        <NextTopLoader color="#EA580C" showSpinner={false} height={2} />
        <Toaster
          position="top-center"
          theme="light"
          toastOptions={{
            style: {
              background: '#FFFFFF',
              border: '1px solid rgba(212, 175, 55, 0.35)',
              color: '#1A1A1A',
            },
          }}
        />
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
