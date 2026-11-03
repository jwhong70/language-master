export type LanguageCode = 'en' | 'ja';

export interface SentenceItem {
  id: string;
  lesson_id: string;
  lang: LanguageCode;
  lesson_number: number;
  paragraph_index: number;
  paragraph_title: string;
  sentence_index: number;
  sentence_in_para: number;
  text: string;
  ko: string;
  note: string;
  audio_url: string;
}

export interface LessonData {
  id: string;
  lang: LanguageCode;
  lesson_number: number;
  title: string;
  paragraph_count: number;
  sentence_count: number;
  completed_count: number;
  last_studied_at?: string | null;
  has_content: boolean;
  sentences: SentenceItem[];
}

export interface StudySettings {
  daily_en_count: number; // 기본 1과
  daily_ja_count: number; // 기본 1과
  review_count: number;   // 기본 2회 복습 (본학습 1회 + 복습 2회 = 총 3회 완료 시 진도표 소멸)
  active_lang: 'en' | 'ja' | 'all'; // 기본 'en' (먼저 영어 구현, 일본어 탭 전환 가능)
  start_date: string;     // YYYY-MM-DD
  extra_unlocked_en: number; // 오늘 추가로 앞당겨 열람한 영어 과 수
  extra_unlocked_ja: number; // 오늘 추가로 앞당겨 열람한 일본어 과 수
}

