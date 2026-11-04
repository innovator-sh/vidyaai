/**
 * Pure helpers that turn the `/v1/stats` payload into chart-ready view models.
 * Every field beyond `chat_count` / `streak_days` / `quiz_results` is optional so the
 * page keeps working against an older backend.
 */

import type { TFunction } from 'i18next';
import type { QuizResultRecord, Stats } from './apiClient';

export const ALL_SUBJECTS = '__all__';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function pct(score: number, total: number): number {
  return total > 0 ? Math.round((score / total) * 100) : 0;
}

export function subjectOf(r: Pick<QuizResultRecord, 'subject'>): string {
  return r.subject?.trim() || 'General';
}

/** "Computer Science" -> "computerScience" (the key used under `subjects.*`). */
export function subjectKey(subject: string): string {
  const words = subject.trim().split(/[\s_-]+/).filter(Boolean);
  return words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('');
}

/** Localised subject name; unknown subjects (user / model generated) are shown as-is. */
export function subjectLabel(t: TFunction, subject: string): string {
  const key = subjectKey(subject);
  if (!key) return subject;
  return t(`subjects.${key}`, { defaultValue: subject });
}

export function formatMinutes(t: TFunction, minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return t('stats.minutes', { count: total });
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? t('stats.hoursOnly', { hours }) : t('stats.hoursMinutes', { hours, minutes: rest });
}

/** Short weekday for a `YYYY-MM-DD` UTC date, e.g. "Mon" / "सोम". */
export function weekdayLabel(date: string, locale: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(d);
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export interface StatsView {
  subjects: string[];
  topicPerformance: { topic: string; score: number; total: number }[];
  quizzesBySubject: { name: string; value: number }[];
  weeklyProgress: { week: string; problems: number; accuracy: number }[];
  weeklyActivity: { day: string; messages: number }[];
  studyTime: { name: string; value: number }[];
  chatsBySubject: { name: string; value: number }[];
  totalStudyMinutes: number;
  /** 0..100, or null when there is nothing to base it on. */
  quizAccuracy: number | null;
  totalQuestions: number;
  chatCount: number;
  streakDays: number;
  hasQuizData: boolean;
  hasWeeklyActivity: boolean;
  hasStudyTime: boolean;
  hasChatsBySubject: boolean;
  /** True when there is nothing at all to chart. */
  isEmpty: boolean;
}

export interface BuildOptions {
  subject?: string;
  now?: number;
  locale?: string;
  t: TFunction;
}

export function buildStatsView(stats: Stats | null, opts: BuildOptions): StatsView {
  const { subject = ALL_SUBJECTS, now = Date.now(), locale = 'en-US', t } = opts;

  const allResults = stats?.quiz_results ?? [];
  const results = subject === ALL_SUBJECTS ? allResults : allResults.filter((r) => subjectOf(r) === subject);
  const subjects = Array.from(new Set(allResults.map(subjectOf))).sort();

  const perSubject = new Map<string, { score: number; total: number; quizzes: number }>();
  for (const r of allResults) {
    const key = subjectOf(r);
    const cur = perSubject.get(key) ?? { score: 0, total: 0, quizzes: 0 };
    cur.score += r.score;
    cur.total += r.total;
    cur.quizzes += 1;
    perSubject.set(key, cur);
  }
  const topicPerformance = Array.from(perSubject, ([name, v]) => ({
    topic: subjectLabel(t, name),
    score: pct(v.score, v.total),
    total: 100,
  }));
  const quizzesBySubject = Array.from(perSubject, ([name, v]) => ({ name: subjectLabel(t, name), value: v.quizzes }));

  const weeklyProgress = Array.from({ length: 6 }, (_, i) => {
    const weeksAgo = 5 - i;
    const end = now - weeksAgo * WEEK_MS;
    const start = end - WEEK_MS;
    const inWeek = results.filter((r) => {
      const ts = r.created_at ? new Date(r.created_at).getTime() : NaN;
      return ts > start && ts <= end;
    });
    const score = inWeek.reduce((a, r) => a + r.score, 0);
    const total = inWeek.reduce((a, r) => a + r.total, 0);
    return {
      week: weeksAgo === 0 ? t('stats.thisWeek') : t('stats.weeksAgo', { count: weeksAgo }),
      problems: total,
      accuracy: pct(score, total),
    };
  });

  const weeklyActivity = (stats?.weekly_activity ?? [])
    .filter((d) => d && typeof d.date === 'string' && finite(d.messages))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ day: weekdayLabel(d.date, locale), messages: Math.max(0, d.messages) }));

  const studyTime = (stats?.study_minutes_by_subject ?? [])
    .filter((s) => s && finite(s.minutes) && s.minutes > 0)
    .map((s) => ({ name: subjectLabel(t, s.subject?.trim() || 'General'), value: Math.round(s.minutes) }));
  const totalStudyMinutes = studyTime.reduce((a, s) => a + s.value, 0);

  const chatsBySubject = (stats?.by_subject ?? [])
    .filter((s) => s && finite(s.count) && s.count > 0)
    .map((s) => ({ name: subjectLabel(t, s.subject?.trim() || 'General'), value: s.count }));

  const totalQuestions = results.reduce((a, r) => a + r.total, 0);
  let quizAccuracy: number | null = null;
  if (subject === ALL_SUBJECTS && finite(stats?.quiz_accuracy)) {
    quizAccuracy = Math.round(Math.min(1, Math.max(0, stats.quiz_accuracy)) * 100);
  } else if (totalQuestions > 0) {
    quizAccuracy = pct(results.reduce((a, r) => a + r.score, 0), totalQuestions);
  }

  const hasQuizData = allResults.length > 0;
  const hasWeeklyActivity = weeklyActivity.some((d) => d.messages > 0);
  const hasStudyTime = totalStudyMinutes > 0;
  const hasChatsBySubject = chatsBySubject.length > 0;

  return {
    subjects,
    topicPerformance,
    quizzesBySubject,
    weeklyProgress,
    weeklyActivity,
    studyTime,
    chatsBySubject,
    totalStudyMinutes,
    quizAccuracy,
    totalQuestions,
    chatCount: stats?.chat_count ?? 0,
    streakDays: stats?.streak_days ?? 0,
    hasQuizData,
    hasWeeklyActivity,
    hasStudyTime,
    hasChatsBySubject,
    isEmpty: !hasQuizData && !hasWeeklyActivity && !hasStudyTime && !hasChatsBySubject,
  };
}
