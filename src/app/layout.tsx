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
 statusBarStyle: 'black-translucent',
 title: '어학 마스터',
 },
 icons: {
 icon: '/icon-192x192.png',
 apple: '/apple-touch-icon.png',
 },
};

export const viewport: Viewport = {
 themeColor: '#0a0a0c',
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
 <html lang="ko" className="dark">
 <head>
 <link rel="manifest" href="/manifest.json" />
 <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
 <meta name="mobile-web-app-capable" content="yes" />
 <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
 <link
 rel="stylesheet"
 as="style"
 crossOrigin="anonymous"
 href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
 />
 </head>
 <body className="min-h-screen bg-[#0a0a0c] text-[#f4f4f6] antialiased selection:bg-[#D4AF37]/30 selection:text-[#FDE68A]">
 <NextTopLoader color="#D4AF37" showSpinner={false} height={2} />
 <Toaster
 position="top-center"
 theme="dark"
 toastOptions={{
 style: {
 background: '#16161a',
 border: '1px solid rgba(212, 175, 55, 0.35)',
 color: '#f4f4f6',
 },
 }}
 />
 {children}
 <InstallPrompt />
 </body>
 </html>
 );
}

