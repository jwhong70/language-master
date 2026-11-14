import seedData from '@/data/lessons_seed.json';
import { LanguageCode, LessonData, SentenceItem, StudySettings } from '@/types/language';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const STORAGE_PROGRESS_KEY = 'language_master_progress_v1';
const STORAGE_SETTINGS_KEY = 'language_master_settings_v1';

export const DEFAULT_SETTINGS: StudySettings = {
  daily_en_count: 1,
  daily_ja_count: 1,
  review_count: 2, // 본학습 1회 + 복습 2회 = 총 3회 카운트 시 진도표에서 졸업(소멸)
  active_lang: 'en',
  start_date: new Date().toISOString().slice(0, 10),
  extra_unlocked_en: 0,
  extra_unlocked_ja: 0,
};

/**
 * 본학습(1회) + 설정된 복습 횟수를 합산한 총 목표 학습 횟수를 계산합니다.
 */
export function getTotalTargetCount(reviewCount: number): number {
  return 1 + Math.max(0, reviewCount);
}

interface SeedLesson {
  id: string;
  lang: string;
  lesson_number: number;
  title: string;
  paragraph_count: number;
  sentence_count: number;
  sentences: SentenceItem[];
}

/**
 * 로컬 시드(lessons_seed.json)를 기반으로 영어 120과 + 일본어 120과 전체 마스터 골격을 생성합니다.
 */
function getSeedLessonsMap(): Map<string, SeedLesson> {
  const map = new Map<string, SeedLesson>();
  const rawLessons = (seedData as { lessons: SeedLesson[] }).lessons || [];
  for (const item of rawLessons) {
    map.set(item.id, item);
  }
  return map;
}

export function buildAll120Lessons(
  progressMap: Record<string, { completed_count: number; last_studied_at?: string | null }> = {}
): LessonData[] {
  const seedMap = getSeedLessonsMap();
  const result: LessonData[] = [];

  const langConfigs: { lang: LanguageCode; total: number }[] = [
    { lang: 'en', total: 120 },
    { lang: 'ja', total: 90 },
  ];

  for (const { lang, total } of langConfigs) {
    for (let num = 1; num <= total; num++) {
      const id = `${lang}_${String(num).padStart(3, '0')}`;
      const seeded = seedMap.get(id);
      const prog = progressMap[id];

      if (seeded) {
        result.push({
          id,
          lang,
          lesson_number: num,
          title: seeded.title,
          paragraph_count: seeded.paragraph_count,
          sentence_count: seeded.sentence_count,
          completed_count: prog?.completed_count ?? 0,
          last_studied_at: prog?.last_studied_at ?? null,
          has_content: seeded.sentences.length > 0,
          sentences: seeded.sentences,
        });
      } else {
        result.push({
          id,
          lang,
          lesson_number: num,
          title:
            lang === 'en'
              ? `English Master Lesson ${num} (원고 준비 중)`
              : `日本語マスター 第${num}課 (원고 준비 중)`,
          paragraph_count: 0,
          sentence_count: 0,
          completed_count: prog?.completed_count ?? 0,
          last_studied_at: prog?.last_studied_at ?? null,
          has_content: false,
          sentences: [],
        });
      }
    }
  }

  return result;
}

/**
 * 브라우저 localStorage에서 진도 데이터를 읽어옵니다.
 */
export function loadLocalProgress(): Record<
  string,
  { completed_count: number; last_studied_at?: string | null }
> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalProgress(
  progress: Record<string, { completed_count: number; last_studied_at?: string | null }>
) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_PROGRESS_KEY, JSON.stringify(progress));
  } catch {}
}

export function loadLocalSettings(): StudySettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveLocalSettings(settings: StudySettings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

/**
 * Supabase가 연결된 경우 DB에서 최신 진도 및 설정을 가져와 localStorage와 병합합니다.
 */
export async function syncWithSupabase(): Promise<{
  settings: StudySettings;
  lessons: LessonData[];
}> {
  const localProg = loadLocalProgress();
  let settings = loadLocalSettings();

  if (isSupabaseConfigured && supabase) {
    try {
      const [{ data: dbSettings }, { data: dbLessons }] = await Promise.all([
        supabase.from('lang_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('lang_lessons').select('id, completed_count, last_studied_at, title'),
      ]);

      if (dbSettings) {
        settings = {
          ...settings,
          daily_en_count: dbSettings.daily_en_count ?? settings.daily_en_count,
          daily_ja_count: dbSettings.daily_ja_count ?? settings.daily_ja_count,
          review_count: dbSettings.review_count ?? settings.review_count,
          active_lang: (dbSettings.active_lang as StudySettings['active_lang']) ?? settings.active_lang,
          start_date: dbSettings.start_date ?? settings.start_date,
        };
        saveLocalSettings(settings);
      }

      if (dbLessons && dbLessons.length > 0) {
        for (const row of dbLessons) {
          const localCount = localProg[row.id]?.completed_count ?? 0;
          const dbCount = row.completed_count ?? 0;
          localProg[row.id] = {
            completed_count: Math.max(localCount, dbCount),
            last_studied_at: row.last_studied_at || localProg[row.id]?.last_studied_at || null,
          };
        }
        saveLocalProgress(localProg);
      }
    } catch (err) {
      console.warn('Supabase 조회 폴백(로컬 모드 유지):', err);
    }
  }

  return {
    settings,
    lessons: buildAll120Lessons(localProg),
  };
}

/**
 * 특정 과의 학습 완료 카운트를 +1 증가(또는 지정 값으로 변경)하고 Supabase 및 로컬에 즉시 반영합니다.
 */
export async function updateLessonCompletion(
  lessonId: string,
  newCount: number
): Promise<void> {
  const nowIso = new Date().toISOString();
  const localProg = loadLocalProgress();
  localProg[lessonId] = {
    completed_count: Math.max(0, newCount),
    last_studied_at: nowIso,
  };
  saveLocalProgress(localProg);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase
        .from('lang_lessons')
        .update({
          completed_count: Math.max(0, newCount),
          last_studied_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', lessonId);
    } catch (err) {
      console.warn('Supabase 진도 업데이트 실패 (로컬 저장 완료):', err);
    }
  }
}

/**
 * 학습 설정(하루 분량, 복습 횟수 등)을 저장합니다.
 */
export async function updateStudySettings(newSettings: StudySettings): Promise<void> {
  saveLocalSettings(newSettings);

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('lang_settings').upsert(
        {
          id: 1,
          daily_en_count: newSettings.daily_en_count,
          daily_ja_count: newSettings.daily_ja_count,
          review_count: newSettings.review_count,
          active_lang: newSettings.active_lang,
          start_date: newSettings.start_date,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    } catch (err) {
      console.warn('Supabase 설정 저장 실패 (로컬 저장 완료):', err);
    }
  }
}

/**
 * 누적 슬라이딩 진도표(1-A) 계산 함수
 * - 시작일(start_date)로부터 경과 일수 * 하루 학습량만큼 과가 열립니다.
 * - 이미 졸업(completed_count >= 1 + review_count)한 과는 진도표에서 자동으로 사라지고,
 *   미졸업 과(신규 0회차 + 복습 중인 과)와 오늘의 신규 분량이 슬라이딩 방식으로 노출됩니다.
 */
export function computeSlidingTodoList(
  allLessons: LessonData[],
  settings: StudySettings,
  lang: LanguageCode
): {
  todoLessons: LessonData[];
  graduatedCount: number;
  inReviewCount: number;
  totalRequiredPerLesson: number;
} {
  const totalRequiredPerLesson = getTotalTargetCount(settings.review_count); // 기본 1 + 2 = 3회
  const langLessons = allLessons
    .filter((l) => l.lang === lang)
    .sort((a, b) => a.lesson_number - b.lesson_number);

  const graduatedCount = langLessons.filter(
    (l) => l.completed_count >= totalRequiredPerLesson
  ).length;
  const inReviewCount = langLessons.filter(
    (l) => l.completed_count > 0 && l.completed_count < totalRequiredPerLesson
  ).length;

  // 시작일 기준 경과일 계산 (최소 1일차)
  const startMs = Date.parse(settings.start_date);
  const todayMs = Date.parse(new Date().toISOString().slice(0, 10));
  const elapsedDays = Number.isNaN(startMs)
    ? 1
    : Math.max(1, Math.floor((todayMs - startMs) / (1000 * 60 * 60 * 24)) + 1);

  const dailyQuota = lang === 'en' ? settings.daily_en_count : settings.daily_ja_count;
  const extraUnlocked =
    lang === 'en' ? settings.extra_unlocked_en || 0 : settings.extra_unlocked_ja || 0;

  // 누적 배정 범위: (경과일 * 하루 학습량) + 추가 열람분
  // 또한 이미 시작된(completed_count > 0) 과는 무조건 복습 큐에 포함
  // 만약 앞선 과들이 졸업했다면, 최소 dailyQuota개의 신규 과가 항상 To-Do에 유지되도록 슬라이딩 보장!
  const targetActivePoolSize = Math.max(dailyQuota, elapsedDays * dailyQuota + extraUnlocked);

  const ungraduated = langLessons.filter(
    (l) => l.completed_count < totalRequiredPerLesson
  );

  // 1) 이미 1회 이상 학습하여 복습 대기 중인 과는 모두 포함
  const reviewing = ungraduated.filter((l) => l.completed_count > 0);
  // 2) 아직 0회차인 신규 과는 하루 할당량(dailyQuota + extraUnlocked)만큼 슬라이딩 배정
  const freshQuota = Math.max(dailyQuota + extraUnlocked, targetActivePoolSize - graduatedCount - reviewing.length);
  const freshNew = ungraduated
    .filter((l) => l.completed_count === 0)
    .slice(0, Math.max(dailyQuota, freshQuota));

  const todoMap = new Map<string, LessonData>();
  for (const item of [...reviewing, ...freshNew]) {
    todoMap.set(item.id, item);
  }

  const todoLessons = Array.from(todoMap.values()).sort(
    (a, b) => a.lesson_number - b.lesson_number
  );

  return {
    todoLessons,
    graduatedCount,
    inReviewCount,
    totalRequiredPerLesson,
  };
}

