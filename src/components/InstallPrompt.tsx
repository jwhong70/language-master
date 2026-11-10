"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isKakao, setIsKakao] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      // 1. 이미 PWA 독립 앱(standalone)으로 실행 중인지 확인
      const isStandalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
      if (isStandalone) return;

      // 2. 이미 설치 완료된 이력이 있는지 확인
      if (localStorage.getItem("language_master_pwa_installed") === "true") return;

      // 3. 7일 이내에 닫기를 눌렀는지 확인
      const dismissedTime = localStorage.getItem("language_master_pwa_dismissed");
      if (dismissedTime) {
        const diffDays = (Date.now() - parseInt(dismissedTime, 10)) / (1000 * 60 * 60 * 24);
        if (diffDays < 7) return;
      }
    } catch {
      // ignore
    }

    // 4. 모바일 기기 또는 768px 미만 화면 감지
    const userAgent = (window.navigator?.userAgent || "").toLowerCase();
    const isMobileDevice =
      /iphone|ipad|ipod|android|blackberry|iemobile|opera mini|mobile/i.test(userAgent) ||
      window.innerWidth < 768;
    if (!isMobileDevice) return;

    // 5. 앱 설치 완료 이벤트 감지
    const handleAppInstalled = () => {
      setIsVisible(false);
      try {
        localStorage.setItem("language_master_pwa_installed", "true");
      } catch {}
    };
    window.addEventListener("appinstalled", handleAppInstalled);

    // 6. 안드로이드 크롬 PWA 설치 신호 감지
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 7. 1.5초 후 자연스러운 슬라이드업 노출
    const timer = setTimeout(() => {
      setIsKakao(userAgent.includes("kakaotalk"));
      setIsIOS(/iphone|ipad|ipod/.test(userAgent));
      setIsVisible(true);
    }, 1500);

    return () => {
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      clearTimeout(timer);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isKakao) {
      const currentUrl = window.location.href;
      const userAgent = (window.navigator?.userAgent || "").toLowerCase();
      if (/android/.test(userAgent)) {
        window.location.href = `intent://${currentUrl.replace(/https?:\/\//i, "")}#Intent;scheme=https;package=com.android.chrome;end`;
        return;
      }
      setShowIOSModal(true);
      return;
    }

    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setIsVisible(false);
          try {
            localStorage.setItem("language_master_pwa_installed", "true");
          } catch {}
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.error("설치 팝업 실패:", err);
        setShowIOSModal(true);
      }
    } else {
      setShowIOSModal(true);
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsVisible(false);
    try {
      localStorage.setItem("language_master_pwa_dismissed", Date.now().toString());
    } catch {}
  };

  if (!isVisible) return null;

  return (
    <>
      {/* 화면 하단 골드 플로팅 설치 배너 (모바일 전용: md:hidden) */}
      <aside
        aria-label="스마트폰 앱 바로가기 설치 안내"
        className="fixed bottom-4 left-3 right-3 z-50 mx-auto max-w-md animate-in fade-in slide-in-from-bottom-5 duration-500 md:hidden"
      >
        <div
          onClick={handleInstallClick}
          className="relative flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-[#D4AF37]/50 bg-[#121217]/95 p-3.5 shadow-2xl backdrop-blur-xl transition-all active:scale-[0.98] hover:border-[#D4AF37]"
        >
          {/* 좌측 공식 앱 아이콘 & 문구 */}
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[#D4AF37]/60 shadow-md">
              <Image
                src="/icon-192x192.png"
                alt="어학 마스터 앱 아이콘"
                width={48}
                height={48}
                priority
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-white">어학 마스터</span>
                <span className="rounded bg-[#D4AF37]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[#FDE68A]">
                  앱으로 추가
                </span>
              </div>
              <p className="text-xs text-zinc-300">
                {isKakao
                  ? "크롬/사파리로 열어 홈 화면에 추가하세요"
                  : "홈 화면에 설치하고 매일 1초 만에 학습!"}
              </p>
            </div>
          </div>

          {/* 우측 액션 버튼 & 닫기 */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleInstallClick();
              }}
              className="rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F59E0B] px-3.5 py-2 text-xs font-bold text-black shadow-lg transition-transform active:scale-95 hover:brightness-110 cursor-pointer"
            >
              {isKakao ? "브라우저로 열기" : "1초 설치"}
            </button>
            <button
              onClick={handleDismiss}
              aria-label="닫기"
              className="p-1 text-zinc-400 hover:text-white cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* 모바일 홈 화면 추가 3단계 안내 모달 */}
      {showIOSModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/85 p-4 backdrop-blur-md sm:items-center animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border border-[#D4AF37]/50 bg-[#16161c] p-6 text-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#FDE68A]">
                {isKakao ? "💬 외부 브라우저 열기" : "📲 스마트폰 홈 화면에 추가하기"}
              </h3>
              <button
                onClick={() => setShowIOSModal(false)}
                aria-label="닫기"
                className="text-zinc-400 hover:text-white text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {isKakao ? (
              <div className="space-y-4">
                <p className="text-sm text-zinc-300 leading-relaxed">
                  카카오톡 안에서는 앱 설치가 제한됩니다. 아래 순서로 <strong>일반 브라우저(크롬/사파리)</strong>로 열어주세요:
                </p>
                <div className="space-y-3 rounded-2xl bg-[#0e0e12] p-4 border border-white/10 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] font-bold text-black">
                      1
                    </span>
                    <span className="leading-snug">
                      화면 맨 우측 상단(또는 하단) <strong>[점 3개 ⋮]</strong> 터치
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] font-bold text-black">
                      2
                    </span>
                    <span className="leading-snug">
                      <strong>[다른 브라우저로 열기]</strong> (크롬/사파리) 터치
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] font-bold text-black">
                      3
                    </span>
                    <span className="leading-snug">
                      열린 화면에서 <strong>[1초 설치]</strong>를 누르면 끝!
                    </span>
                  </div>
                </div>
              </div>
            ) : isIOS ? (
              <div className="space-y-4">
                <p className="text-sm text-zinc-300 leading-relaxed">
                  사파리(Safari) 브라우저에서 아래 3단계만 누르시면 스마트폰 첫 화면에 어학 마스터 앱 아이콘이 바로 생성됩니다:
                </p>
                <div className="space-y-3 rounded-2xl bg-[#0e0e12] p-4 border border-white/10 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] font-bold text-black">
                      1
                    </span>
                    <span className="leading-snug">
                      화면 맨 아래 <strong>[공유 버튼 ⎋]</strong> (네모에 화살표) 터치
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] font-bold text-black">
                      2
                    </span>
                    <span className="leading-snug">
                      목록을 올려 <strong>[홈 화면에 추가 ➕]</strong> 터치
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] font-bold text-black">
                      3
                    </span>
                    <span className="leading-snug">
                      우측 상단 <strong>[추가]</strong> 터치하면 설치 완료!
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-zinc-300 leading-relaxed">
                  브라우저 메뉴에서 홈 화면에 추가하실 수 있습니다:
                </p>
                <div className="space-y-3 rounded-2xl bg-[#0e0e12] p-4 border border-white/10 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] font-bold text-black">
                      1
                    </span>
                    <span className="leading-snug">
                      브라우저 우측 상단 <strong>[점 3개 ⋮]</strong> 터치
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] font-bold text-black">
                      2
                    </span>
                    <span className="leading-snug">
                      <strong>[홈 화면에 추가]</strong> 또는 <strong>[앱 설치]</strong> 터치
                    </span>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowIOSModal(false)}
              className="mt-6 w-full rounded-xl bg-[#D4AF37] py-3 text-sm font-bold text-black shadow-md hover:bg-[#e5c247] active:scale-95 transition-all cursor-pointer"
            >
              확인했습니다
            </button>
          </div>
        </div>
      )}
    </>
  );
}

