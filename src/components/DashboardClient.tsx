'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Cloud,
  HardDrive,
  Layers,
  PlusCircle,
  RotateCcw,
  Settings,
  Sparkles,
  Volume2,
  Check,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  buildAll120Lessons,
  computeSlidingTodoList,
  DEFAULT_SETTINGS,
  loadLocalProgress,
  loadLocalSettings,
  syncWithSupabase,
  updateLessonCompletion,
  updateStudySettings,
} from '@/lib/curriculum';
import { isSupabaseConfigured } from '@/lib/supabase';
import { LanguageCode, LessonData, StudySettings } from '@/types/language';

export default function DashboardClient() {
  const [settings, setSettings] = useState<StudySettings>(DEFAULT_SETTINGS);
  const [lessons, setLessons] = useState<LessonData[]>(() => buildAll120Lessons({}));
  const [isHydrated, setIsHydrated] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [viewTab, setViewTab] = useState<'todo' | 'curriculum'>('todo');
  const [curriculumFilter, setCurriculumFilter] = useState<
    'all' | 'ready' | 'reviewing' | 'graduated'
  >('all');

  // 설정 폼 임시 상태
  const [draftDailyEn, setDraftDailyEn] = useState(1);
  const [draftDailyJa, setDraftDailyJa] = useState(1);
  const [draftReviewCount, setDraftReviewCount] = useState(2);

  useEffect(() => {
    const localSet = loadLocalSettings();
    const localProg = loadLocalProgress();
    setSettings(localSet);
    setLessons(buildAll120Lessons(localProg));
    setDraftDailyEn(localSet.daily_en_count);
    setDraftDailyJa(localSet.daily_ja_count);
    setDraftReviewCount(localSet.review_count);
    setIsHydrated(true);

    syncWithSupabase().then(({ settings: syncedSet, lessons: syncedLessons }) => {
      setSettings(syncedSet);
      setLessons(syncedLessons);
      setDraftDailyEn(syncedSet.daily_en_count);
      setDraftDailyJa(syncedSet.daily_ja_count);
      setDraftReviewCount(syncedSet.review_count);
    });
  }, []);

  const totalTargetCount = 1 + Math.max(0, settings.review_count);

  const enStats = useMemo(
    () => computeSlidingTodoList(lessons, settings, 'en'),
    [lessons, settings]
  );
  const jaStats = useMemo(
    () => computeSlidingTodoList(lessons, settings, 'ja'),
    [lessons, settings]
  );

  const handleLanguageSwitch = async (langMode: 'en' | 'ja' | 'all') => {
    const next: StudySettings = { ...settings, active_lang: langMode };
    setSettings(next);
    await updateStudySettings(next);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: StudySettings = {
      ...settings,
      daily_en_count: Math.max(0, Math.min(20, Number(draftDailyEn) || 0)),
      daily_ja_count: Math.max(0, Math.min(20, Number(draftDailyJa) || 0)),
      review_count: Math.max(0, Math.min(10, Number(draftReviewCount) || 0)),
    };
    setSettings(next);
    await updateStudySettings(next);
    setShowSettingsModal(false);
    toast.success(
      `진도 설정 저장 완료: 하루 영어 ${next.daily_en_count}과 · 일본어 ${next.daily_ja_count}과 · 복습 ${next.review_count}회 (총 ${1 + next.review_count}회 학습)`
    );
  };

  const handleUnlockNextLesson = async (lang: LanguageCode) => {
    const next: StudySettings = {
      ...settings,
      extra_unlocked_en:
        lang === 'en' ? (settings.extra_unlocked_en || 0) + 1 : settings.extra_unlocked_en || 0,
      extra_unlocked_ja:
        lang === 'ja' ? (settings.extra_unlocked_ja || 0) + 1 : settings.extra_unlocked_ja || 0,
    };
    setSettings(next);
    await updateStudySettings(next);
    toast.success(
      `${lang === 'en' ? '영어' : '일본어'} 다음 신규 과를 오늘의 To-Do 진도표에 추가했습니다.`
    );
  };

  const handleQuickIncrement = async (
    e: React.MouseEvent,
    lesson: LessonData
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const nextCount = lesson.completed_count + 1;
    await updateLessonCompletion(lesson.id, nextCount);

    setLessons((prev) =>
      prev.map((item) =>
        item.id === lesson.id
          ? {
              ...item,
              completed_count: nextCount,
              last_studied_at: new Date().toISOString(),
            }
          : item
      )
    );

    if (nextCount >= totalTargetCount) {
      toast.success(
        `🎉 [${lesson.lang.toUpperCase()} 제${lesson.lesson_number}과] 본학습 및 복습(${settings.review_count}회)을 모두 마쳐 진도표에서 졸업했습니다!`
      );
    } else {
      const remainReviews = totalTargetCount - nextCount;
      toast.success(
        `✅ [${lesson.lang.toUpperCase()} 제${lesson.lesson_number}과] 학습 완료 (${nextCount}/${totalTargetCount}회) · 남은 복습 ${remainReviews}회`
      );
    }
  };

  const handleResetLesson = async (e: React.MouseEvent, lesson: LessonData) => {
    e.preventDefault();
    e.stopPropagation();
    await updateLessonCompletion(lesson.id, 0);
    setLessons((prev) =>
      prev.map((item) =>
        item.id === lesson.id ? { ...item, completed_count: 0, last_studied_at: null } : item
      )
    );
    toast.info(`[${lesson.lang.toUpperCase()} 제${lesson.lesson_number}과] 진도를 0회로 초기화했습니다.`);
  };

  // 현재 표시할 To-Do 과 목록
  const visibleTodoGroups: { lang: LanguageCode; label: string; items: LessonData[] }[] =
    useMemo(() => {
      if (settings.active_lang === 'en') {
        return [{ lang: 'en', label: '🇺🇸 영어 (English 120과)', items: enStats.todoLessons }];
      }
      if (settings.active_lang === 'ja') {
        return [{ lang: 'ja', label: '🇯🇵 일본어 (Japanese 90과)', items: jaStats.todoLessons }];
      }
      return [
        { lang: 'en', label: '🇺🇸 영어 (English 120과)', items: enStats.todoLessons },
        { lang: 'ja', label: '🇯🇵 일본어 (Japanese 90과)', items: jaStats.todoLessons },
      ];
    }, [settings.active_lang, enStats.todoLessons, jaStats.todoLessons]);

  // 전체 120과 커리큘럼 필터링
  const currentCurriculumLang: LanguageCode =
    settings.active_lang === 'ja' ? 'ja' : 'en';
  const filteredCurriculumLessons = useMemo(() => {
    const base = lessons.filter((l) => l.lang === currentCurriculumLang);
    if (curriculumFilter === 'ready') {
      return base.filter((l) => l.has_content);
    }
    if (curriculumFilter === 'reviewing') {
      return base.filter(
        (l) => l.completed_count > 0 && l.completed_count < totalTargetCount
      );
    }
    if (curriculumFilter === 'graduated') {
      return base.filter((l) => l.completed_count >= totalTargetCount);
    }
    return base;
  }, [lessons, currentCurriculumLang, curriculumFilter, totalTargetCount]);

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-[#f4f4f6] pb-20">
      {/* 상단 헤더: 모바일 2행 완전 분리 */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0a0a0c]/90 backdrop-blur-md">
        <div className="mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 sm:px-6">
          {/* 1행: 로고 및 타이틀 (모바일 100% 전폭 단독 점유) */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#D4AF37] shrink-0">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white select-none whitespace-nowrap">
                LANGUAGE MASTER
              </h1>
              <p className="text-xs text-zinc-400 whitespace-nowrap">
                영어 120과 · 일본어 90과 누적 복습 트레이닝
              </p>
            </div>
          </div>

          {/* 2행: 진도 설정 버튼 (모바일 전폭 단독 2행, 데스크톱 우측 정렬) */}
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${
                isSupabaseConfigured
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
              }`}
              title={
                isSupabaseConfigured
                  ? 'Supabase 클라우드 DB와 실시간 동기화 중'
                  : '로컬 시드 및 브라우저 저장소 사용 중 (.env.local 설정 시 클라우드 자동 연동)'
              }
            >
              {isSupabaseConfigured ? (
                <>
                  <Cloud className="h-3.5 w-3.5" />
                  Supabase 연동됨
                </>
              ) : (
                <>
                  <HardDrive className="h-3.5 w-3.5" />
                  로컬 즉시학습 모드
                </>
              )}
            </span>

            <button
              type="button"
              onClick={() => {
                setDraftDailyEn(settings.daily_en_count);
                setDraftDailyJa(settings.daily_ja_count);
                setDraftReviewCount(settings.review_count);
                setShowSettingsModal((prev) => !prev);
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#D4AF37]/40 bg-[#16161a] px-3.5 py-2.5 sm:py-2 text-xs sm:text-sm font-semibold text-[#FDE68A] hover:bg-[#D4AF37]/15 transition-colors cursor-pointer"
            >
              <Settings className="h-4 w-4 text-[#D4AF37]" />
              <span>진도 설정</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 space-y-6">
        {/* 진도 설정 모달/패널 */}
        {showSettingsModal && (
          <section className="rounded-2xl border border-[#D4AF37]/40 bg-[#131318] p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-[#D4AF37]" />
                <h2 className="text-base sm:text-lg font-bold text-white">
                  일일 학습 분량 및 복습 횟수 설정
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                닫기 ✕
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              {/* 학습 언어 모드 선택 */}
              <div className="rounded-xl border border-white/10 bg-[#0d0d11] p-4">
                <label className="block text-xs font-semibold text-zinc-400 mb-2">
                  🎯 학습 진행 언어 설정
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleLanguageSwitch('en')}
                    className={`rounded-lg p-3 text-left transition-all border cursor-pointer ${
                      settings.active_lang === 'en'
                        ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-white'
                        : 'border-white/10 bg-[#16161c] text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-white">🇺🇸 영어만 진행</span>
                      {settings.active_lang === 'en' && <Check className="h-4 w-4 text-[#D4AF37]" />}
                    </div>
                    <p className="text-xs text-zinc-400">영어 120과 진도 집중</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLanguageSwitch('ja')}
                    className={`rounded-lg p-3 text-left transition-all border cursor-pointer ${
                      settings.active_lang === 'ja'
                        ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-white'
                        : 'border-white/10 bg-[#16161c] text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-white">🇯🇵 일본어만 진행</span>
                      {settings.active_lang === 'ja' && <Check className="h-4 w-4 text-[#D4AF37]" />}
                    </div>
                    <p className="text-xs text-zinc-400">일본어 90과 진도 집중</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLanguageSwitch('all')}
                    className={`rounded-lg p-3 text-left transition-all border cursor-pointer ${
                      settings.active_lang === 'all'
                        ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-white'
                        : 'border-white/10 bg-[#16161c] text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-white">🌏 둘 다 진행</span>
                      {settings.active_lang === 'all' && <Check className="h-4 w-4 text-[#D4AF37]" />}
                    </div>
                    <p className="text-xs text-zinc-400">영어 + 일본어 동시 To-Do</p>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-[#0d0d11] p-4">
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    🇺🇸 하루 영어 신규 학습 분량
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={draftDailyEn}
                      onChange={(e) => setDraftDailyEn(Number(e.target.value))}
                      className="w-full rounded-lg border border-white/15 bg-[#18181f] px-3 py-2 text-base font-bold text-white focus:ring-1 focus:ring-[#D4AF37] focus:outline-none"
                    />
                    <span className="text-sm font-medium text-zinc-300 shrink-0">과 / 일</span>
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500">기본 설정: 하루 1과</p>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0d0d11] p-4">
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    🇯🇵 하루 일본어 신규 학습 분량
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={draftDailyJa}
                      onChange={(e) => setDraftDailyJa(Number(e.target.value))}
                      className="w-full rounded-lg border border-white/15 bg-[#18181f] px-3 py-2 text-base font-bold text-white focus:ring-1 focus:ring-[#D4AF37] focus:outline-none"
                    />
                    <span className="text-sm font-medium text-zinc-300 shrink-0">과 / 일</span>
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500">기본 설정: 하루 1과</p>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0d0d11] p-4">
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                    🔁 과당 필수 복습 횟수
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={draftReviewCount}
                      onChange={(e) => setDraftReviewCount(Number(e.target.value))}
                      className="w-full rounded-lg border border-white/15 bg-[#18181f] px-3 py-2 text-base font-bold text-white focus:ring-1 focus:ring-[#D4AF37] focus:outline-none"
                    />
                    <span className="text-sm font-medium text-zinc-300 shrink-0">회 복습</span>
                  </div>
                  <p className="mt-1.5 text-xs text-[#D4AF37]">
                    본학습 1회 + 복습 {draftReviewCount}회 = 총 {1 + Number(draftReviewCount)}회 완료 시 졸업
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                <p className="text-xs text-zinc-400">
                  💡 본문에서 [학습 완료] 버튼을 누를 때마다 횟수가 +1 증가하며, 총 {1 + Number(draftReviewCount)}회가 채워지면 To-Do 진도표에서 자동으로 사라집니다.
                </p>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setDraftDailyEn(1);
                      setDraftDailyJa(1);
                      setDraftReviewCount(2);
                    }}
                    className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-white/5 cursor-pointer"
                  >
                    기본값(1과·2회 복습) 복원
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-[#D4AF37] px-4 py-2 text-xs sm:text-sm font-bold text-black hover:bg-[#e5c247] transition-colors cursor-pointer"
                  >
                    설정 저장하기
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}

        {/* 상단 요약 대시보드 카드 */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#131318] p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400">현재 학습 규칙</span>
              <Sparkles className="h-4 w-4 text-[#D4AF37]" />
            </div>
            <p className="mt-2 text-base sm:text-lg font-bold text-white">
              영어 {settings.daily_en_count}과 · 일어 {settings.daily_ja_count}과 / 일
            </p>
            <p className="mt-1 text-xs text-[#FDE68A]">
              복습 {settings.review_count}회 설정 (과당 총 {totalTargetCount}회 완료 시 졸업)
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#131318] p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400">🇺🇸 영어 120과 진행률</span>
              <span className="text-xs font-mono font-bold text-[#D4AF37]">
                {enStats.graduatedCount} / 120과 졸업
              </span>
            </div>
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#D4AF37] transition-all duration-500"
                style={{ width: `${Math.min(100, (enStats.graduatedCount / 120) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              오늘 To-Do <strong className="text-white">{enStats.todoLessons.length}개</strong> · 복습 진행 중{' '}
              <strong className="text-amber-300">{enStats.inReviewCount}개</strong>
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#131318] p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400">🇯🇵 일본어 90과 진행률</span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {jaStats.graduatedCount} / 90과 졸업
              </span>
            </div>
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min(100, (jaStats.graduatedCount / 90) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              오늘 To-Do <strong className="text-white">{jaStats.todoLessons.length}개</strong> · 복습 진행 중{' '}
              <strong className="text-emerald-300">{jaStats.inReviewCount}개</strong>
            </p>
          </div>
        </section>

        {/* 언어 선택 & 뷰 모드 전환 바 */}
        <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => handleLanguageSwitch('en')}
              className={`w-full sm:w-auto text-center rounded-xl px-4 py-2.5 sm:py-2 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                settings.active_lang === 'en'
                  ? 'bg-[#D4AF37] text-black shadow-lg'
                  : 'border border-white/10 bg-[#131318] text-zinc-300 hover:border-white/25'
              }`}
            >
              🇺🇸 영어 (English 120과)
            </button>
            <button
              type="button"
              onClick={() => handleLanguageSwitch('ja')}
              className={`w-full sm:w-auto text-center rounded-xl px-4 py-2.5 sm:py-2 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                settings.active_lang === 'ja'
                  ? 'bg-[#D4AF37] text-black shadow-lg'
                  : 'border border-white/10 bg-[#131318] text-zinc-300 hover:border-white/25'
              }`}
            >
              🇯🇵 일본어 (Japanese 90과)
            </button>
            <button
              type="button"
              onClick={() => handleLanguageSwitch('all')}
              className={`w-full sm:w-auto text-center rounded-xl px-4 py-2.5 sm:py-2 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                settings.active_lang === 'all'
                  ? 'bg-[#D4AF37] text-black shadow-lg'
                  : 'border border-white/10 bg-[#131318] text-zinc-300 hover:border-white/25'
              }`}
            >
              🌏 영어 + 일본어 통합 진도표
            </button>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setViewTab('todo')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 sm:py-1.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                viewTab === 'todo'
                  ? 'bg-white/15 text-white border border-white/25'
                  : 'text-zinc-400 hover:text-white border border-transparent'
              }`}
            >
              <CheckCircle2 className="h-4 w-4 text-[#D4AF37] shrink-0" />
              <span>오늘의 To-Do</span>
            </button>
            <button
              type="button"
              onClick={() => setViewTab('curriculum')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 sm:py-1.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                viewTab === 'curriculum'
                  ? 'bg-white/15 text-white border border-white/25'
                  : 'text-zinc-400 hover:text-white border border-transparent'
              }`}
            >
              <Layers className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>전체 커리큘럼</span>
            </button>
          </div>
        </section>

        {/* 탭 1: 오늘의 To-Do 진도표 (메인 화면) */}
        {viewTab === 'todo' && (
          <div className="space-y-8">
            {visibleTodoGroups.map((group) => (
              <section key={group.lang} className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                  <div className="flex items-center justify-between sm:justify-start gap-2.5 w-full sm:w-auto">
                    <h2 className="text-base sm:text-lg font-bold text-white">
                      {group.label} · 오늘의 To-Do 리스트
                    </h2>
                    <span className="rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 px-2.5 py-0.5 text-xs font-bold text-[#FDE68A] shrink-0">
                      {group.items.length}개
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUnlockNextLesson(group.lang)}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-[#16161c] px-3.5 py-2.5 sm:py-1.5 text-xs font-semibold text-zinc-200 hover:border-[#D4AF37]/50 hover:text-[#FDE68A] transition-colors cursor-pointer"
                  >
                    <PlusCircle className="h-3.5 w-3.5 text-[#D4AF37] shrink-0" />
                    <span>다음 신규 과 오늘 진도에 추가 (+1과)</span>
                  </button>
                </div>

                {!isHydrated ? (
                  <div className="rounded-2xl border border-white/10 bg-[#131318] p-8 text-center text-sm text-zinc-400">
                    진도표를 불러오는 중입니다...
                  </div>
                ) : group.items.length === 0 ? (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/15 p-8 text-center space-y-3">
                    <p className="text-base sm:text-lg font-bold text-emerald-300">
                      🎉 현재 배정된 모든 과의 본학습 및 복습을 완료했습니다!
                    </p>
                    <p className="text-sm text-zinc-400">
                      우측 상단의 [+ 다음 신규 과 오늘 진도에 추가] 버튼을 눌러 다음 진도를 바로 시작하실 수 있습니다.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3.5">
                    {group.items.map((lesson) => {
                      const isNew = lesson.completed_count === 0;
                      const currentReviewNum = lesson.completed_count; // 1이면 복습 1회차 차례
                      const remainCount = Math.max(0, totalTargetCount - lesson.completed_count);

                      return (
                        <div
                          key={lesson.id}
                          className="group relative rounded-2xl border border-white/12 bg-[#131318] p-4 sm:p-5 transition-all hover:border-[#D4AF37]/60 hover:bg-[#17171f] shadow-md"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            {/* 좌측: 클릭 시 본문으로 이동하는 영역 */}
                            <Link
                              href={`/lesson/${lesson.lang}/${lesson.lesson_number}`}
                              className="flex-1 space-y-2"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-mono font-bold text-white">
                                  {lesson.lang.toUpperCase()} · 제{lesson.lesson_number}과
                                </span>

                                {isNew ? (
                                  <span className="rounded-full border border-[#D4AF37]/50 bg-[#D4AF37]/15 px-2.5 py-0.5 text-xs font-bold text-[#FDE68A]">
                                    신규 본학습 (0/{totalTargetCount}회)
                                  </span>
                                ) : (
                                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                                    복습 {currentReviewNum}/{settings.review_count}회차 진행 대기 ({lesson.completed_count}/{totalTargetCount}회 완료)
                                  </span>
                                )}

                                {lesson.has_content ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                                    <Volume2 className="h-3.5 w-3.5 text-[#D4AF37]" />
                                    {lesson.paragraph_count}개 문단 · {lesson.sentence_count}문장 음성 준비됨
                                  </span>
                                ) : (
                                  <span className="text-xs text-zinc-500">
                                    markdown 원고 대기 중 (contents/{lesson.lang}/lesson_
                                    {String(lesson.lesson_number).padStart(3, '0')}.md)
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center justify-between">
                                <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-[#FDE68A] transition-colors">
                                  {lesson.title}
                                </h3>
                              </div>

                              {/* 학습 & 복습 스텝 게이지 도트 */}
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                {Array.from({ length: totalTargetCount }).map((_, idx) => {
                                  const isDone = idx < lesson.completed_count;
                                  const stepLabel = idx === 0 ? '본학습' : `복습 ${idx}회`;
                                  return (
                                    <span
                                      key={idx}
                                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium border ${
                                        isDone
                                          ? 'border-[#D4AF37]/50 bg-[#D4AF37]/20 text-[#FDE68A]'
                                          : 'border-white/10 bg-black/30 text-zinc-500'
                                      }`}
                                    >
                                      <Check
                                        className={`h-3 w-3 ${
                                          isDone ? 'text-[#D4AF37]' : 'opacity-30'
                                        }`}
                                      />
                                      {stepLabel}
                                    </span>
                                  );
                                })}
                                <span className="text-xs text-zinc-400 ml-1">
                                  (남은 횟수 {remainCount}회 완료 시 진도표에서 자동 졸업)
                                </span>
                              </div>
                            </Link>

                            {/* 액션 버튼 바: 모바일 1버튼 1행(w-full), 데스크톱 우측 정렬 */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto pt-2.5 sm:pt-0 border-t sm:border-t-0 border-white/5 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => handleQuickIncrement(e, lesson)}
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-4 py-2.5 sm:py-2 text-xs font-bold text-[#FDE68A] hover:bg-[#D4AF37] hover:text-black transition-all cursor-pointer"
                                title="진도 카운트 +1 증가"
                              >
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>완료 +1 ({lesson.completed_count}/{totalTargetCount})</span>
                              </button>

                              <Link
                                href={`/lesson/${lesson.lang}/${lesson.lesson_number}`}
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-1 rounded-xl bg-[#D4AF37] px-4 py-2.5 sm:py-2 text-xs sm:text-sm font-bold text-black hover:bg-[#e5c247] transition-colors"
                              >
                                <span>본문 학습</span>
                                <ChevronRight className="h-4 w-4 shrink-0" />
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        {/* 탭 2: 전체 120과 아카이브 목록 */}
        {viewTab === 'curriculum' && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">
                  {currentCurriculumLang === 'en'
                    ? '🇺🇸 영어 전체 120과 커리큘럼 & 복습 기록'
                    : '🇯🇵 일본어 전체 120과 커리큘럼 & 복습 기록'}
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  이미 졸업(복습 완료)하여 To-Do 진도표에서 사라진 과도 이곳에서 언제든 다시 열람하거나 초기화할 수 있습니다.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                {[
                  { id: 'all', label: '전체 120과' },
                  { id: 'ready', label: '원고 수록됨' },
                  { id: 'reviewing', label: '복습 진행 중' },
                  { id: 'graduated', label: '졸업 완료' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() =>
                      setCurriculumFilter(
                        f.id as 'all' | 'ready' | 'reviewing' | 'graduated'
                      )
                    }
                    className={`rounded-lg px-2.5 py-2 sm:py-1 text-xs font-semibold text-center cursor-pointer ${
                      curriculumFilter === f.id
                        ? 'bg-[#D4AF37] text-black font-bold'
                        : 'border border-white/10 bg-[#131318] text-zinc-300 hover:border-white/25'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {filteredCurriculumLessons.map((lesson) => {
                const isGraduated = lesson.completed_count >= totalTargetCount;
                const isReviewing =
                  lesson.completed_count > 0 && lesson.completed_count < totalTargetCount;

                return (
                  <div
                    key={lesson.id}
                    className={`flex items-center justify-between rounded-xl border p-3.5 transition-all ${
                      isGraduated
                        ? 'border-emerald-500/35 bg-emerald-950/10'
                        : isReviewing
                        ? 'border-[#D4AF37]/45 bg-[#17171f]'
                        : 'border-white/10 bg-[#131318] hover:border-white/25'
                    }`}
                  >
                    <Link
                      href={`/lesson/${lesson.lang}/${lesson.lesson_number}`}
                      className="flex-1 min-w-0 pr-3"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-[#D4AF37]">
                          제{String(lesson.lesson_number).padStart(3, '0')}과
                        </span>
                        {isGraduated && (
                          <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[11px] font-bold text-emerald-300">
                            졸업 ({lesson.completed_count}/{totalTargetCount})
                          </span>
                        )}
                        {isReviewing && (
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-bold text-amber-300">
                            복습 중 ({lesson.completed_count}/{totalTargetCount})
                          </span>
                        )}
                        {lesson.has_content && (
                          <span className="text-[11px] text-zinc-400">
                            · {lesson.sentence_count}문장
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-white">
                        {lesson.title}
                      </p>
                    </Link>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {lesson.completed_count > 0 && (
                        <button
                          type="button"
                          onClick={(e) => handleResetLesson(e, lesson)}
                          className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:border-white/30 hover:text-white cursor-pointer"
                          title="진도 횟수 0으로 초기화 (다시 진도표에 올리기)"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <Link
                        href={`/lesson/${lesson.lang}/${lesson.lesson_number}`}
                        className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-[#D4AF37] hover:text-black hover:border-[#D4AF37] transition-colors"
                      >
                        열기
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

