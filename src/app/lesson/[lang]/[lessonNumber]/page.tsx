import { notFound } from 'next/navigation';
import LessonPlayerClient from '@/components/LessonPlayerClient';
import { LanguageCode } from '@/types/language';

interface LessonPageProps {
 params: Promise<{
 lang: string;
 lessonNumber: string;
 }>;
}

export default async function LessonPage({ params }: LessonPageProps) {
 const { lang, lessonNumber } = await params;

 const cleanLang = lang.toLowerCase();
 if (cleanLang !== 'en' && cleanLang !== 'ja') {
 notFound();
 }

 const num = Number(lessonNumber);
 if (!Number.isInteger(num) || num < 1 || num > 120) {
 notFound();
 }

 return (
 <LessonPlayerClient
 lang={cleanLang as LanguageCode}
 lessonNumber={num}
 />
 );
}

