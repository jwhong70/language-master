'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
 ArrowLeft,
 ArrowRight,
 CheckCircle2,
 ChevronDown,
 ChevronUp,
 ListMusic,
 Pause,
 Play,
 Repeat,
 RotateCcw,
 Square,
 Volume2,
 BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import {
 buildAll120Lessons,
 DEFAULT_SETTINGS,
 loadLocalProgress,
 loadLocalSettings,
 syncWithSupabase,
 updateLessonCompletion,
} from '@/lib/curriculum';
import { LanguageCode, LessonData, SentenceItem, StudySettings } from '@/types/language';

type PlaybackMode = 'idle' | 'single' | 'loop_sentence' | 'paragraph' | 'all_lesson';

interface LessonPlayerClientProps {
 lang: LanguageCode;
 lessonNumber: number;
}

export default function LessonPlayerClient({
 lang,
 lessonNumber,
}: LessonPlayerClientProps) {
 const router = useRouter();
 const lessonId = `${lang}_${String(lessonNumber).padStart(3, '0')}`;

 const [settings, setSettings] = useState<StudySettings>(DEFAULT_SETTINGS);
 const [lesson, setLesson] = useState<LessonData | null>(() => {
 const all = buildAll120Lessons({});
 return all.find((l) => l.id === lessonId) || null;
 });

 // 아코디언 펼침 상태 (sentence.id 집합)
 const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
 const [allExpanded, setAllExpanded] = useState(false);

 // 오디오 재생 상태
 const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('idle');
 const [activeSentenceId, setActiveSentenceId] = useState<string | null>(null);
 const [activeParagraphIdx, setActiveParagraphIdx] = useState<number | null>(null);
 const [isPaused, setIsPaused] = useState(false);
 const [playbackRate, setPlaybackRate] = useState<number>(1.0);
 const [loopCounter, setLoopCounter] = useState<number>(0);

 const audioRef = useRef<HTMLAudioElement | null>(null);
 const playbackModeRef = useRef<PlaybackMode>('idle');
 const queueRef = useRef<SentenceItem[]>([]);
 const queueIdxRef = useRef<number>(0);
 const playbackRateRef = useRef<number>(1.0);
 const sentenceCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

 useEffect(() => {
 playbackRateRef.current = playbackRate;
 if (audioRef.current) {
 audioRef.current.playbackRate = playbackRate;
 }
 }, [playbackRate]);

 useEffect(() => {
 const localSet = loadLocalSettings();
 const localProg = loadLocalProgress();
 setSettings(localSet);
 const localAll = buildAll120Lessons(localProg);
 const found = localAll.find((l) => l.id === lessonId) || null;
 setLesson(found);

 syncWithSupabase().then(({ settings: syncedSet, lessons: syncedLessons }) => {
 setSettings(syncedSet);
 const syncedFound = syncedLessons.find((l) => l.id === lessonId) || null;
 if (syncedFound) setLesson(syncedFound);
 });
 }, [lessonId]);

 // 언마운트 시 오디오 정리
 useEffect(() => {
 return () => {
 if (audioRef.current) {
 audioRef.current.pause();
 audioRef.current.src = '';
 }
 if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
 window.speechSynthesis.cancel();
 }
 };
 }, []);

 const totalTargetCount = 1 + Math.max(0, settings.review_count);

 // 문단별 그룹화
 const paragraphs = useMemo(() => {
 if (!lesson) return [];
 const map = new Map<
 number,
 { paragraph_index: number; paragraph_title: string; sentences: SentenceItem[] }
 >();
 for (const s of lesson.sentences) {
 const existing = map.get(s.paragraph_index);
 if (existing) {
 existing.sentences.push(s);
 } else {
 map.set(s.paragraph_index, {
 paragraph_index: s.paragraph_index,
 paragraph_title: s.paragraph_title,
 sentences: [s],
 });
 }
 }
 return Array.from(map.values()).sort(
 (a, b) => a.paragraph_index - b.paragraph_index
 );
 }, [lesson]);

 const stopAudio = useCallback(() => {
 playbackModeRef.current = 'idle';
 setPlaybackMode('idle');
 setIsPaused(false);
 setActiveSentenceId(null);
 setActiveParagraphIdx(null);
 setLoopCounter(0);
 queueRef.current = [];
 queueIdxRef.current = 0;

 if (audioRef.current) {
 audioRef.current.onended = null;
 audioRef.current.onerror = null;
 audioRef.current.pause();
 }
 if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
 window.speechSynthesis.cancel();
 }
 }, []);

 // 브라우저 TTS 폴백 함수 (MP3 파일이 아직 없는 문장 대비)
 const speakWithWebSpeechFallback = useCallback(
 (sentence: SentenceItem, onEndedCallback: () => void) => {
 if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
 onEndedCallback();
 return;
 }
 window.speechSynthesis.cancel();
 const utter = new SpeechSynthesisUtterance(sentence.text);
 utter.lang = sentence.lang === 'ja' ? 'ja-JP' : 'en-US';
 utter.rate = playbackRateRef.current;
 utter.onend = () => onEndedCallback();
 utter.onerror = () => onEndedCallback();
 window.speechSynthesis.speak(utter);
 },
 []
 );

 // 큐 내 특정 인덱스의 문장 오디오 실행
 const playSentenceAtQueueIndex = useCallback(
 (idx: number) => {
 const queue = queueRef.current;
 const mode = playbackModeRef.current;
 if (mode === 'idle' || idx < 0 || idx >= queue.length) {
 stopAudio();
 return;
 }

 const target = queue[idx];
 queueIdxRef.current = idx;
 setActiveSentenceId(target.id);
 setActiveParagraphIdx(target.paragraph_index);
 setIsPaused(false);

 // 현재 읽는 문장으로 부드럽게 스크롤 포커스
 const cardEl = sentenceCardRefs.current[target.id];
 if (cardEl) {
 cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
 }

 const handleTrackEnded = () => {
 const currentMode = playbackModeRef.current;
 if (currentMode === 'idle') return;

 if (currentMode === 'single') {
 stopAudio();
 return;
 }

 if (currentMode === 'loop_sentence') {
 setLoopCounter((c) => c + 1);
 playSentenceAtQueueIndex(0);
 return;
 }

 if (currentMode === 'paragraph' || currentMode === 'all_lesson') {
 const nextIdx = queueIdxRef.current + 1;
 if (nextIdx < queueRef.current.length) {
 playSentenceAtQueueIndex(nextIdx);
 } else {
 stopAudio();
 }
 }
 };

 if (!audioRef.current) {
 audioRef.current = new Audio();
 }
 const audio = audioRef.current;
 audio.pause();
 audio.src = target.audio_url;
 audio.playbackRate = playbackRateRef.current;
 audio.onended = handleTrackEnded;
 audio.onerror = () => {
 speakWithWebSpeechFallback(target, handleTrackEnded);
 };

 audio.play().catch(() => {
 speakWithWebSpeechFallback(target, handleTrackEnded);
 });
 },
 [speakWithWebSpeechFallback, stopAudio]
 );

 // 1) 1문장 1회 읽어주기
 const handlePlaySingleSentence = (sentence: SentenceItem) => {
 if (
 playbackMode === 'single' &&
 activeSentenceId === sentence.id &&
 !isPaused
 ) {
 stopAudio();
 return;
 }
 stopAudio();
 playbackModeRef.current = 'single';
 setPlaybackMode('single');
 queueRef.current = [sentence];
 playSentenceAtQueueIndex(0);
 };

 // 2) 1문장 무한 반복해서 듣기
 const handleLoopSentence = (sentence: SentenceItem) => {
 if (playbackMode === 'loop_sentence' && activeSentenceId === sentence.id) {
 stopAudio();
 return;
 }
 stopAudio();
 playbackModeRef.current = 'loop_sentence';
 setPlaybackMode('loop_sentence');
 setLoopCounter(1);
 queueRef.current = [sentence];
 playSentenceAtQueueIndex(0);
 };

 // 3) 한 문단씩 연속 읽어주기
 const handlePlayParagraph = (
 paragraphIndex: number,
 paraSentences: SentenceItem[]
 ) => {
 if (
 playbackMode === 'paragraph' &&
 activeParagraphIdx === paragraphIndex &&
 !isPaused
 ) {
 stopAudio();
 return;
 }
 stopAudio();
 playbackModeRef.current = 'paragraph';
 setPlaybackMode('paragraph');
 queueRef.current = paraSentences;
 playSentenceAtQueueIndex(0);
 };

 // 4) 과 전체 문장 연속 읽어주기
 const handlePlayAllLesson = () => {
 if (!lesson || lesson.sentences.length === 0) return;
 if (playbackMode === 'all_lesson' && !isPaused) {
 stopAudio();
 return;
 }
 stopAudio();
 playbackModeRef.current = 'all_lesson';
 setPlaybackMode('all_lesson');
 queueRef.current = lesson.sentences;
 playSentenceAtQueueIndex(0);
 };

 // 일시정지 / 재개 토글
 const handleTogglePause = () => {
 if (!audioRef.current || playbackMode === 'idle') return;
 if (isPaused) {
 audioRef.current.play();
 setIsPaused(false);
 } else {
 audioRef.current.pause();
 setIsPaused(true);
 }
 };

 // 개별 문장 해석/해설 펼침 토글
 const toggleSentenceAccordion = (sentenceId: string) => {
 setExpandedIds((prev) => ({
 ...prev,
 [sentenceId]: !prev[sentenceId],
 }));
 };

 // 전체 문장 해석/해설 일괄 펼침/접기
 const toggleAllAccordions = () => {
 if (!lesson) return;
 const nextState = !allExpanded;
 setAllExpanded(nextState);
 const nextMap: Record<string, boolean> = {};
 for (const s of lesson.sentences) {
 nextMap[s.id] = nextState;
 }
 setExpandedIds(nextMap);
 };

 // 학습 완료 (Count +1) 처리
 const handleCompleteStudy = async () => {
 if (!lesson) return;
 const nextCount = lesson.completed_count + 1;
 await updateLessonCompletion(lesson.id, nextCount);
 setLesson({
 ...lesson,
 completed_count: nextCount,
 last_studied_at: new Date().toISOString(),
 });

 if (nextCount >= totalTargetCount) {
 toast.success(
 `🎉 축하합니다! [${lang.toUpperCase()} 제${lessonNumber}과] 본학습 및 복습(${settings.review_count}회)을 모두 완료하여 진도표에서 졸업했습니다!`
 );
 } else {
 const remain = totalTargetCount - nextCount;
 toast.success(
 `✅ 학습 카운트 완료! (${nextCount}/${totalTargetCount}회) · 복습 ${remain}회 더 완료하면 진도표에서 졸업합니다.`
 );
 }
 };

 // NOTE 텍스트 마크다운 강조(**텍스트**) 간단 렌더러
 const renderFormattedNote = (noteText: string) => {
 if (!noteText) return null;
 return noteText.split('\n').map((line, i) => {
 const trimmed = line.trim();
 if (!trimmed) return <div key={i} className="h-1.5" />;

 const parts = trimmed.split(/(\*\*.*?\*\*|`.*?`)/g);
 return (
 <p key={i} className="text-sm text-gray-700 leading-relaxed">
 {parts.map((part, idx) => {
 if (part.startsWith('**') && part.endsWith('**')) {
 return (
 <strong key={idx} className="font-bold text-[#FDE68A]">
 {part.slice(2, -2)}
 </strong>
 );
 }
 if (part.startsWith('`') && part.endsWith('`')) {
 return (
 <code
 key={idx}
 className="bg-white/10 px-1.5 py-0.5 font-mono text-xs text-amber-200"
 >
 {part.slice(1, -1)}
 </code>
 );
 }
 return <React.Fragment key={idx}>{part}</React.Fragment>;
 })}
 </p>
 );
 });
 };

 if (!lesson) {
 return (
 <div className="min-h-screen bg-[#F9F8F6] text-gray-900 flex flex-col items-center justify-center p-6">
 <p className="text-base sm:text-lg font-bold">해당 과를 찾을 수 없습니다.</p>
 <Link
 href="/"
 className="mt-4 bg-[#D4AF37] px-4 py-2 text-sm font-bold text-black"
 >
 진도표로 돌아가기
 </Link>
 </div>
 );
 }

 const isGraduated = lesson.completed_count >= totalTargetCount;

 return (
 <div className="min-h-screen bg-[#F9F8F6] text-[#f4f4f6] pb-36">
 {/* 상단 고정 네비게이션: 모바일 2행 분리 */}
 <header className="sticky top-0 z-30 border-b border-black/10 bg-[#F9F8F6]/95 backdrop-blur-md">
 <div className="mx-auto flex max-w-4xl flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 px-4 py-2.5 sm:px-6">
 <div className="flex items-center justify-between w-full sm:w-auto">
 <Link
 href="/"
 onClick={() => stopAudio()}
 className="inline-flex items-center gap-1.5 border border-white/15 bg-[#FAF9F5] px-3 py-1.5 text-xs sm:text-sm font-semibold text-zinc-200 hover:border-[#D4AF37]/50 hover:text-[#FDE68A] transition-colors"
 >
 <ArrowLeft className="h-3.5 w-3.5" />
 <span>To-Do 진도표</span>
 </Link>

 <div className="flex items-center gap-1.5">
 {lessonNumber > 1 && (
 <Link
 href={`/lesson/${lang}/${lessonNumber - 1}`}
 onClick={() => stopAudio()}
 className="border border-black/10 bg-[#FAF9F5] p-1.5 text-gray-700 hover:border-white/30 hover:text-gray-900"
 title="이전 과"
 >
 <ArrowLeft className="h-4 w-4" />
 </Link>
 )}
 {lessonNumber < 120 && (
 <Link
 href={`/lesson/${lang}/${lessonNumber + 1}`}
 onClick={() => stopAudio()}
 className="border border-black/10 bg-[#FAF9F5] p-1.5 text-gray-700 hover:border-white/30 hover:text-gray-900"
 title="다음 과"
 >
 <ArrowRight className="h-4 w-4" />
 </Link>
 )}
 </div>
 </div>

 <div className="flex items-center justify-center sm:justify-end w-full sm:w-auto">
 <span className="w-full sm:w-auto text-center rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/15 px-3 py-1 text-xs font-bold text-[#FDE68A]">
 학습 횟수: {lesson.completed_count} / {totalTargetCount}회
 {isGraduated ? ' (졸업 완료)' : ''}
 </span>
 </div>
 </div>
 </header>

 <main className="mx-auto max-w-4xl px-4 pt-6 sm:px-6 space-y-6">
 {/* 과 타이틀 & 전체 오디오/해설 컨트롤 헤더: 완전 1행 1요소 수직 스택 */}
 <section className="border border-white/12 bg-white p-5 sm:p-6 shadow-xl space-y-4">
 <div className="flex flex-col gap-2.5 w-full">
 {/* 1행: 언어 및 과 번호 배지 */}
 <div>
 <span className="inline-block bg-[#D4AF37] px-2.5 py-1 text-xs font-extrabold text-black tracking-wider">
 {lang === 'en' ? 'ENGLISH' : 'JAPANESE'} · LESSON{' '}
 {String(lessonNumber).padStart(3, '0')}
 </span>
 </div>

 {/* 2행: 문단 및 문장 수 정보 */}
 <div className="text-xs text-gray-600 font-medium">
 {lesson.paragraph_count}개 문단 · 총 {lesson.sentence_count}개 문장 수록
 </div>

 {/* 3행: 과 제목 */}
 <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-gray-900 select-none pt-0.5">
 {lesson.title}
 </h1>

 {/* 4행 & 5행: 전체 재생 및 해설 펼침 버튼 (각각 1행씩 완전 분리) */}
 {lesson.has_content && (
 <div className="flex flex-col gap-2.5 w-full pt-3 border-t border-black/10">
 <button
 type="button"
 onClick={handlePlayAllLesson}
 className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
 playbackMode === 'all_lesson'
 ? 'bg-[#D4AF37] text-black shadow-lg'
 : 'border border-[#D4AF37]/50 bg-[#D4AF37]/15 text-[#FDE68A] hover:bg-[#D4AF37] hover:text-black'
 }`}
 >
 <ListMusic className="h-4 w-4 shrink-0" />
 <span>
 {playbackMode === 'all_lesson' ? '전체 연속재생 정지' : '과 전체 연속 듣기'}
 </span>
 </button>

 <button
 type="button"
 onClick={toggleAllAccordions}
 className="w-full inline-flex items-center justify-center gap-2 border border-white/15 bg-[#1a1a22] px-4 py-3 text-xs sm:text-sm font-semibold text-zinc-200 hover:border-white/30 transition-colors cursor-pointer"
 >
 <BookOpen className="h-4 w-4 text-[#D4AF37] shrink-0" />
 <span>{allExpanded ? '해석·해설 모두 접기' : '해석·해설 모두 펼치기'}</span>
 </button>
 </div>
 )}
 </div>

 {/* 사용 안내 팁 바: 모바일 2행 분리 */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border border-white/8 bg-[#0c0c10] px-3.5 py-2.5 text-xs text-gray-600">
 <span className="w-full sm:w-auto">
 💡 각 문단의 <strong className="text-[#FDE68A]">[문단 연속 듣기]</strong>, 각 문장의{' '}
 <strong className="text-[#FDE68A]">[1문장 듣기]</strong> ·{' '}
 <strong className="text-emerald-300">[1문장 반복]</strong> ·{' '}
 <strong className="text-gray-900">[해석·해설 펼침]</strong> 버튼을 터치해 학습하세요.
 </span>

 {/* 재생 배속 선택 (모바일 단독 1행) */}
 <div className="flex items-center justify-between sm:justify-end gap-1 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-black/5">
 <span className="text-[11px] text-gray-500 mr-1 shrink-0">배속:</span>
 <div className="flex items-center gap-1">
 {[0.75, 0.9, 1.0, 1.15, 1.25].map((rate) => (
 <button
 key={rate}
 type="button"
 onClick={() => setPlaybackRate(rate)}
 className={`px-2.5 py-1 sm:py-0.5 text-xs font-mono font-semibold cursor-pointer ${
 playbackRate === rate
 ? 'bg-[#D4AF37] text-black font-bold'
 : 'bg-white/5 text-gray-600 hover:text-gray-900'
 }`}
 >
 {rate}x
 </button>
 ))}
 </div>
 </div>
 </div>
 </section>

 {/* 원고가 아직 없는 과일 때 안내 */}
 {!lesson.has_content ? (
 <section className="border border-black/10 bg-white p-8 text-center space-y-4">
 <p className="text-base sm:text-lg font-bold text-gray-900">
 아직 이 과의 마크다운(`.md`) 원고가 작성되지 않았습니다.
 </p>
 <p className="text-sm text-gray-600 max-w-xl mx-auto leading-relaxed">
 <code className="bg-white/10 px-2 py-0.5 text-amber-300">
 C:\coding\LANGUAGE\contents\{lang}\lesson_{String(lessonNumber).padStart(3, '0')}.md
 </code>{' '}
 파일을 생성하신 뒤{' '}
 <code className="bg-white/10 px-2 py-0.5 text-emerald-300">
 python scripts/sync_lessons.py
 </code>
 를 실행하면 문장과 원어민 음성이 자동으로 채워집니다.
 </p>
 </section>
 ) : (
 /* 문단 및 문장 본문 리스트 */
 <div className="space-y-6">
 {paragraphs.map((para) => {
 const isParaPlaying =
 playbackMode === 'paragraph' && activeParagraphIdx === para.paragraph_index;

 return (
 <section
 key={para.paragraph_index}
 className={`border transition-all p-4 sm:p-6 space-y-4 ${isParaPlaying
 ? 'border-[#D4AF37]/70 bg-[#16161f] shadow-lg'
 : 'border-black/10 bg-white'
 }`}
 >
 {/* 문단 헤더: 완전 1행 1요소 분리 (줄바꿈 원천 차단) */}
 <div className="flex flex-col gap-2 border-b border-black/10 pb-3.5">
 <div className="flex items-center gap-2">
 <span className="bg-white/10 px-2.5 py-0.5 text-xs font-mono font-bold text-[#D4AF37]">
 문단 {para.paragraph_index}
 </span>
 </div>

 <h2 className="text-base sm:text-lg font-bold text-gray-900 leading-snug">
 {para.paragraph_title}
 </h2>

 <button
 type="button"
 onClick={() =>
 handlePlayParagraph(para.paragraph_index, para.sentences)
 }
 className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
 isParaPlaying
 ? 'bg-[#D4AF37] text-black shadow-md'
 : 'border border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#FDE68A] hover:bg-[#D4AF37] hover:text-black'
 }`}
 >
 {isParaPlaying ? (
 <>
 <Square className="h-3.5 w-3.5 fill-current shrink-0" />
 <span>문단 읽기 정지</span>
 </>
 ) : (
 <>
 <Volume2 className="h-4 w-4 shrink-0" />
 <span>이 문단 연속 읽어주기 ({para.sentences.length}문장)</span>
 </>
 )}
 </button>
 </div>

 {/* 문단 내 문장 카드 목록 */}
 <div className="space-y-3">
 {para.sentences.map((sentence) => {
 const isCurrentActive = activeSentenceId === sentence.id;
 const isSinglePlaying =
 isCurrentActive && playbackMode === 'single';
 const isLoopingThis =
 isCurrentActive && playbackMode === 'loop_sentence';
 const isOpen = Boolean(expandedIds[sentence.id]);

 return (
 <div
 key={sentence.id}
 ref={(el) => {
 sentenceCardRefs.current[sentence.id] = el;
 }}
 className={`border transition-all ${isCurrentActive
 ? 'border-[#D4AF37] bg-[#1b1b26] shadow-lg'
 : 'border-black/10 bg-[#0e0e13] hover:border-white/20'
 }`}
 >
 {/* 문장 상단 영역 */}
 <div className="p-4 sm:p-5 flex flex-col gap-3">
 <div className="flex items-start justify-between gap-3">
 {/* 문장 번호 + 원어 문장 (클릭 시 펼침 메뉴 토글) */}
 <button
 type="button"
 onClick={() => toggleSentenceAccordion(sentence.id)}
 className="flex-1 text-left flex items-start gap-3 cursor-pointer group"
 >
 <span
 className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-mono font-bold ${isCurrentActive
 ? 'bg-[#D4AF37] text-black'
 : 'bg-white/10 text-gray-600 group-hover:text-gray-900'
 }`}
 >
 {sentence.sentence_index}
 </span>
 <span className="text-base sm:text-lg font-bold leading-relaxed text-gray-900 group-hover:text-[#FDE68A] transition-colors">
 {sentence.text}
 </span>
 </button>
 </div>

 {/* 문장 하단 컨트롤 바: 모바일 1줄에 1버튼씩 완전 분리 (줄바꿈 원천 차단) */}
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1 pl-0 sm:pl-9">
 <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
 {/* 1문장 읽어주는 버튼 */}
 <button
 type="button"
 onClick={() => handlePlaySingleSentence(sentence)}
 className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-1.5 text-xs font-bold transition-all cursor-pointer ${
 isSinglePlaying
 ? 'bg-[#D4AF37] text-black shadow-md'
 : 'border border-white/15 bg-[#171720] text-zinc-200 hover:border-[#D4AF37]/60 hover:text-[#FDE68A]'
 }`}
 >
 {isSinglePlaying ? (
 <>
 <Square className="h-3.5 w-3.5 fill-current shrink-0" />
 <span>1문장 정지</span>
 </>
 ) : (
 <>
 <Play className="h-3.5 w-3.5 fill-current text-[#D4AF37] shrink-0" />
 <span>1문장 듣기</span>
 </>
 )}
 </button>

 {/* 1문장 반복해서 들을 수 있는 버튼 */}
 <button
 type="button"
 onClick={() => handleLoopSentence(sentence)}
 className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-1.5 text-xs font-bold transition-all cursor-pointer ${
 isLoopingThis
 ? 'bg-emerald-400 text-black shadow-md'
 : 'border border-white/15 bg-[#171720] text-zinc-200 hover:border-emerald-400/60 hover:text-emerald-300'
 }`}
 >
 <Repeat className="h-3.5 w-3.5 shrink-0" />
 <span>
 {isLoopingThis
 ? `1문장 반복 중 (${loopCounter}회차 · 정지)`
 : '1문장 반복 듣기'}
 </span>
 </button>
 </div>

 {/* 한글 해석 및 해설 펼침 메뉴 버튼 */}
 <button
 type="button"
 onClick={() => toggleSentenceAccordion(sentence.id)}
 className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
 isOpen
 ? 'bg-[#D4AF37]/20 text-[#FDE68A] border border-[#D4AF37]/40'
 : 'bg-white/5 text-gray-700 hover:bg-white/10 hover:text-gray-900 border border-black/10'
 }`}
 >
 <span>{isOpen ? '한글 해석·해설 접기' : '한글 해석·해설 펼치기'}</span>
 {isOpen ? (
 <ChevronUp className="h-3.5 w-3.5 shrink-0" />
 ) : (
 <ChevronDown className="h-3.5 w-3.5 shrink-0" />
 )}
 </button>
 </div>
 </div>

 {/* 아코디언 펼침 영역: 한글 해석(KO) + 어휘·문법 해설(NOTE) */}
 {isOpen && (
 <div className="border-t border-black/10 bg-[#14141d] px-4 py-4 sm:px-6 pl-9 sm:pl-12 space-y-3 ">
 <p className="text-sm sm:text-base font-bold text-gray-900 leading-relaxed">
 {sentence.ko}
 </p>

 {sentence.note && (
 <div className="space-y-1 border-t border-white/8 pt-2.5">
 {renderFormattedNote(sentence.note)}
 </div>
 )}
 </div>
 )}
 </div>
 );
 })}
 </div>
 </section>
 );
 })}
 </div>
 )}

 {/* 본문 하단 대형 완료 카드 */}
 <section className="border border-[#D4AF37]/40 bg-[#13131a] p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
 <div className="space-y-1">
 <h3 className="text-base sm:text-lg font-bold text-gray-900">
 {isGraduated
 ? '🎉 이 과의 본학습 및 복습을 모두 완수하셨습니다!'
 : `학습 완료 카운트 (${lesson.completed_count} / ${totalTargetCount}회)`}
 </h3>
 <p className="text-xs sm:text-sm text-gray-600">
 {isGraduated
 ? '이미 진도표에서 졸업한 과입니다. 추가 복습을 원하시면 언제든 완료 버튼을 더 누르실 수 있습니다.'
 : `완료 버튼을 누르면 학습 횟수가 +1 카운트되며, 총 ${totalTargetCount}회(본학습 1회 + 복습 ${settings.review_count}회)가 채워지면 진도표에서 사라집니다.`}
 </p>
 </div>

 <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto shrink-0">
 <button
 type="button"
 onClick={handleCompleteStudy}
 className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#D4AF37] px-5 py-3 text-sm sm:text-base font-extrabold text-black hover:bg-[#e5c247] transition-all shadow-lg cursor-pointer"
 >
 <CheckCircle2 className="h-5 w-5 shrink-0" />
 <span>
 학습 완료 (Count +1 · {lesson.completed_count}/{totalTargetCount})
 </span>
 </button>

 <button
 type="button"
 onClick={() => {
 stopAudio();
 router.push('/');
 }}
 className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 border border-white/15 bg-[#1b1b24] px-4 py-3 text-xs sm:text-sm font-bold text-zinc-200 hover:border-white/30 cursor-pointer"
 >
 <span>진도표 확인</span>
 </button>
 </div>
 </section>
 </main>

 {/* 하단 고정(Sticky) 오디오 & 완료 플로팅 컨트롤 바 */}
 <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#D4AF37]/30 bg-[#0e0e14]/95 backdrop-blur-md">
 <div className="mx-auto flex max-w-4xl flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 px-4 py-2.5 sm:px-6">
 {/* 현재 오디오 재생 상태 표시 */}
 <div className="flex items-center justify-between sm:justify-start gap-3 min-w-0">
 {playbackMode !== 'idle' ? (
 <div className="flex items-center gap-2.5 min-w-0">
 <button
 type="button"
 onClick={handleTogglePause}
 className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] text-black hover:bg-[#e5c247] cursor-pointer"
 title={isPaused ? '다시 재생' : '일시정지'}
 >
 {isPaused ? (
 <Play className="h-4 w-4 fill-current" />
 ) : (
 <Pause className="h-4 w-4 fill-current" />
 )}
 </button>
 <button
 type="button"
 onClick={stopAudio}
 className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/5 text-gray-900 hover:bg-white/15 cursor-pointer"
 title="정지"
 >
 <Square className="h-3.5 w-3.5 fill-current" />
 </button>
 <div className="min-w-0">
 <p className="text-xs font-bold text-[#FDE68A] truncate">
 {playbackMode === 'single' && '▶️ 1문장 재생 중'}
 {playbackMode === 'loop_sentence' &&
 `🔁 1문장 반복 중 (${loopCounter}회)`}
 {playbackMode === 'paragraph' &&
 `📄 문단 ${activeParagraphIdx} 재생 중`}
 {playbackMode === 'all_lesson' && '🎵 전체 연속 재생 중'}
 </p>
 <p className="text-[11px] text-gray-600 truncate">
 배속 {playbackRate}x · 문장 클릭 시 즉시 이동
 </p>
 </div>
 </div>
 ) : (
 <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 truncate">
 <Volume2 className="h-4 w-4 text-[#D4AF37] shrink-0" />
 <span className="truncate">문장/문단의 재생 버튼을 눌러보세요.</span>
 </div>
 )}

 {/* 모바일 우측 초기화 버튼 */}
 {lesson.completed_count > 0 && (
 <button
 type="button"
 onClick={async () => {
 await updateLessonCompletion(lesson.id, 0);
 setLesson({ ...lesson, completed_count: 0, last_studied_at: null });
 toast.info('이 과의 학습 횟수를 0회로 초기화했습니다.');
 }}
 className="sm:hidden border border-black/10 p-2 text-gray-600 hover:text-gray-900 cursor-pointer shrink-0"
 title="카운트 0으로 초기화"
 >
 <RotateCcw className="h-3.5 w-3.5" />
 </button>
 )}
 </div>

 {/* 우측 하단 빠른 완료 버튼: 모바일에서는 전폭(w-full) */}
 <div className="flex items-center gap-2 w-full sm:w-auto">
 {lesson.completed_count > 0 && (
 <button
 type="button"
 onClick={async () => {
 await updateLessonCompletion(lesson.id, 0);
 setLesson({ ...lesson, completed_count: 0, last_studied_at: null });
 toast.info('이 과의 학습 횟수를 0회로 초기화했습니다.');
 }}
 className="hidden sm:inline-flex border border-black/10 p-2 text-gray-600 hover:text-gray-900 cursor-pointer"
 title="카운트 0으로 초기화"
 >
 <RotateCcw className="h-4 w-4" />
 </button>
 )}

 <button
 type="button"
 onClick={handleCompleteStudy}
 className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-[#D4AF37] px-4 py-2.5 text-xs sm:text-sm font-extrabold text-black hover:bg-[#e5c247] transition-colors cursor-pointer"
 >
 <CheckCircle2 className="h-4 w-4 shrink-0" />
 <span>
 완료 Count +1 ({lesson.completed_count}/{totalTargetCount})
 </span>
 </button>
 </div>
 </div>
 </div>
 </div>
 );
}

