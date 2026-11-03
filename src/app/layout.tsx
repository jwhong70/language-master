import type { Metadata } from 'next';
import NextTopLoader from 'nextjs-toploader';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'LANGUAGE MASTER | 영어 120과 · 일본어 120과 스마트 진도 & 섀도잉',
  description:
    '영어 120과 · 일본어 120과 누적 복습 To-Do 진도표 및 문단·문장·반복 오디오 트레이닝 웹',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <head>
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
      </body>
    </html>
  );
}

