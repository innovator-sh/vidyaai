import { beforeAll, describe, expect, test } from 'vitest';
import i18n from '@/i18n';
import type { Stats } from '../apiClient';
import { ALL_SUBJECTS, buildStatsView, formatMinutes, subjectKey, subjectLabel, weekdayLabel } from '../stats-view';

const t = i18n.t;
const NOW = Date.parse('2026-11-04T12:00:00Z');

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const base: Stats = { quiz_results: [], chat_count: 0, streak_days: 0 };

describe('buildStatsView', () => {
  test('degrades gracefully against an old backend (no new fields)', () => {
    const view = buildStatsView(base, { now: NOW, t });
    expect(view.isEmpty).toBe(true);
    expect(view.weeklyActivity).toEqual([]);
    expect(view.studyTime).toEqual([]);
    expect(view.quizAccuracy).toBeNull();
    expect(view.chatCount).toBe(0);
  });

  test('handles a null payload (not loaded yet)', () => {
    const view = buildStatsView(null, { now: NOW, t });
    expect(view.isEmpty).toBe(true);
    expect(view.streakDays).toBe(0);
  });

  test('maps study minutes, chats by subject and weekly activity', () => {
    const view = buildStatsView(
      {
        ...base,
        chat_count: 7,
        streak_days: 3,
        by_subject: [
          { subject: 'Physics', count: 4 },
          { subject: 'Computer Science', count: 3 },
          { subject: 'Zero', count: 0 },
        ],
        study_minutes_by_subject: [
          { subject: 'Physics', minutes: 95 },
          { subject: 'History', minutes: 0 },
        ],
        weekly_activity: [
          { date: '2026-11-04', messages: 2 },
          { date: '2026-11-02', messages: 5 },
          { date: '2026-11-03', messages: 0 },
        ],
      },
      { now: NOW, t },
    );

    expect(view.chatsBySubject).toEqual([
      { name: 'Physics', value: 4 },
      { name: 'Computer Science', value: 3 },
    ]);
    expect(view.studyTime).toEqual([{ name: 'Physics', value: 95 }]);
    expect(view.totalStudyMinutes).toBe(95);
    // sorted oldest first regardless of server order
    expect(view.weeklyActivity.map((d) => d.messages)).toEqual([5, 0, 2]);
    expect(view.hasWeeklyActivity).toBe(true);
    expect(view.isEmpty).toBe(false);
    expect(view.chatCount).toBe(7);
    expect(view.streakDays).toBe(3);
  });

  test('all-zero weekly activity counts as empty', () => {
    const view = buildStatsView(
      { ...base, weekly_activity: [{ date: '2026-11-04', messages: 0 }] },
      { now: NOW, t },
    );
    expect(view.hasWeeklyActivity).toBe(false);
    expect(view.isEmpty).toBe(true);
  });

  test('ignores malformed entries instead of crashing', () => {
    const view = buildStatsView(
      {
        ...base,
        study_minutes_by_subject: [{ subject: 'X', minutes: Number.NaN }],
        weekly_activity: [{ date: '2026-11-04', messages: Number.POSITIVE_INFINITY }],
      },
      { now: NOW, t },
    );
    expect(view.studyTime).toEqual([]);
    expect(view.weeklyActivity).toEqual([]);
  });

  test('quiz accuracy prefers the server value (0..1) when all subjects are selected', () => {
    const stats: Stats = {
      ...base,
      quiz_accuracy: 0.666,
      quiz_results: [{ score: 1, total: 4, subject: 'Physics', created_at: '2026-11-03T10:00:00Z' }],
    };
    expect(buildStatsView(stats, { now: NOW, t }).quizAccuracy).toBe(67);
    // ...but a subject filter must be computed from the filtered results
    expect(buildStatsView(stats, { now: NOW, t, subject: 'Physics' }).quizAccuracy).toBe(25);
  });

  test('quiz accuracy is computed from results when the server omits it, and null when there is none', () => {
    const withResults = buildStatsView(
      {
        ...base,
        quiz_results: [
          { score: 3, total: 4, subject: 'Maths' },
          { score: 1, total: 4, subject: 'Maths' },
        ],
      },
      { now: NOW, t },
    );
    expect(withResults.quizAccuracy).toBe(50);
    expect(withResults.totalQuestions).toBe(8);
    expect(buildStatsView({ ...base, quiz_accuracy: null }, { now: NOW, t }).quizAccuracy).toBeNull();
  });

  test('per-subject performance, quiz counts and the 6-week series', () => {
    const view = buildStatsView(
      {
        ...base,
        quiz_results: [
          { score: 4, total: 5, subject: 'Physics', created_at: '2026-11-03T12:00:00Z' },
          { score: 2, total: 5, subject: 'Physics', created_at: '2026-10-28T12:00:00Z' },
          { score: 5, total: 5, subject: null, created_at: '2026-09-25T12:00:00Z' },
        ],
      },
      { now: NOW, t, subject: ALL_SUBJECTS },
    );

    expect(view.subjects).toEqual(['General', 'Physics']);
    expect(view.topicPerformance).toEqual(
      expect.arrayContaining([
        { topic: 'Physics', score: 60, total: 100 },
        { topic: 'General', score: 100, total: 100 },
      ]),
    );
    expect(view.quizzesBySubject).toEqual(expect.arrayContaining([{ name: 'Physics', value: 2 }, { name: 'General', value: 1 }]));
    expect(view.weeklyProgress).toHaveLength(6);
    expect(view.weeklyProgress.at(-1)).toMatchObject({ week: 'This week', problems: 5, accuracy: 80 });
    expect(view.weeklyProgress.at(-2)).toMatchObject({ problems: 5, accuracy: 40 });
  });
});

describe('labels and formatting', () => {
  test('subjectKey / subjectLabel localise known subjects and keep unknown ones', async () => {
    expect(subjectKey('Computer Science')).toBe('computerScience');
    expect(subjectLabel(t, 'Mathematics')).toBe('Mathematics');
    expect(subjectLabel(t, 'Underwater Basket Weaving')).toBe('Underwater Basket Weaving');
    await i18n.changeLanguage('hi');
    expect(subjectLabel(t, 'Mathematics')).toBe('गणित');
    expect(subjectLabel(t, 'Underwater Basket Weaving')).toBe('Underwater Basket Weaving');
    await i18n.changeLanguage('en');
  });

  test('formatMinutes', () => {
    expect(formatMinutes(t, 45)).toBe('45 min');
    expect(formatMinutes(t, 120)).toBe('2 h');
    expect(formatMinutes(t, 135.4)).toBe('2 h 15 min');
    expect(formatMinutes(t, -5)).toBe('0 min');
  });

  test('weekdayLabel uses UTC so the label matches the server day', () => {
    expect(weekdayLabel('2026-11-02', 'en-US')).toBe('Mon');
    expect(weekdayLabel('not-a-date', 'en-US')).toBe('not-a-date');
  });
});
