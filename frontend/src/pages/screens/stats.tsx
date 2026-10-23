import { useEffect, useMemo, useState } from 'react';
import { ChartBar, ChatCircle, CheckCircle, Fire } from 'phosphor-react';
import { BarChart } from '../../components/retroui/charts/BarChart';
import { PieChart } from '../../components/retroui/charts/PieChart';
import { LineChart } from '../../components/retroui/charts/LineChart';
import PillNav from '../../components/PillNav';
import { Select } from '../../components/retroui/Select';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { api, ApiError, type Stats as StatsResponse, type QuizResultRecord } from '../../lib/apiClient';

const ALL = '__all__';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function pct(score: number, total: number): number {
  return total > 0 ? Math.round((score / total) * 100) : 0;
}

function subjectOf(r: QuizResultRecord): string {
  return r.subject?.trim() || 'General';
}

function Stats() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState(ALL);
  const [renderedAt] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    api
      .getStats()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load your stats.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allResults = useMemo(() => stats?.quiz_results ?? [], [stats]);
  const subjects = useMemo(() => Array.from(new Set(allResults.map(subjectOf))).sort(), [allResults]);
  const results = useMemo(
    () => (selectedSubject === ALL ? allResults : allResults.filter((r) => subjectOf(r) === selectedSubject)),
    [allResults, selectedSubject],
  );

  // Average score per subject (percent)
  const topicPerformance = useMemo(() => {
    const bySubject = new Map<string, { score: number; total: number }>();
    for (const r of allResults) {
      const key = subjectOf(r);
      const cur = bySubject.get(key) ?? { score: 0, total: 0 };
      cur.score += r.score;
      cur.total += r.total;
      bySubject.set(key, cur);
    }
    return Array.from(bySubject, ([topic, v]) => ({ topic, score: pct(v.score, v.total), total: 100 }));
  }, [allResults]);

  // Number of quizzes per subject
  const quizzesBySubject = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of allResults) counts.set(subjectOf(r), (counts.get(subjectOf(r)) ?? 0) + 1);
    return Array.from(counts, ([name, value]) => ({ name, value }));
  }, [allResults]);

  // Last 6 weeks: questions answered and accuracy
  const weeklyProgress = useMemo(() => {
    const now = renderedAt;
    return Array.from({ length: 6 }, (_, i) => {
      const weeksAgo = 5 - i;
      const end = now - weeksAgo * WEEK_MS;
      const start = end - WEEK_MS;
      const inWeek = results.filter((r) => {
        const t = r.created_at ? new Date(r.created_at).getTime() : NaN;
        return t > start && t <= end;
      });
      const score = inWeek.reduce((a, r) => a + r.score, 0);
      const total = inWeek.reduce((a, r) => a + r.total, 0);
      return { week: weeksAgo === 0 ? 'This week' : `${weeksAgo}w ago`, problems: total, accuracy: pct(score, total) };
    });
  }, [results, renderedAt]);

  const totalQuestions = results.reduce((a, r) => a + r.total, 0);
  const averageScore = results.length
    ? Math.round(results.reduce((a, r) => a + pct(r.score, r.total), 0) / results.length)
    : 0;
  const hasQuizData = allResults.length > 0;

  return (
    <div className="stats-container">
      <PillNav />

      <div className="stats-content">
        <div className="stats-header">
          <h1 className="stats-title">Your Stats</h1>
          <p className="stats-subtitle">Your Learning Progress Dashboard</p>

          <div className="subject-selector">
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <Select.Trigger className="subject-select-trigger">
                <Select.Value />
              </Select.Trigger>
              <Select.Content className="subject-select-content">
                <Select.Item value={ALL} className="subject-select-item">
                  <span>All Subjects</span>
                </Select.Item>
                {subjects.map((subject) => (
                  <Select.Item key={subject} value={subject} className="subject-select-item">
                    <span>{subject}</span>
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </div>

        {error && (
          <p role="alert" style={{ color: '#c00', fontFamily: 'Sora, sans-serif', marginBottom: 16 }}>{error}</p>
        )}
        {loading && <p style={{ fontFamily: 'Sora, sans-serif' }}>Loading your stats...</p>}
        {!loading && !error && !hasQuizData && (
          <p style={{ fontFamily: 'Sora, sans-serif', marginBottom: 16 }}>
            No quiz results yet. Generate a quiz from any chat answer and your progress will show up here.
          </p>
        )}

        {hasQuizData && (
          <div className="stats-grid">
            <div className="chart-card">
              <div className="chart-header">
                <h2 className="chart-title">Subject-wise Performance</h2>
                <p className="chart-description">Your average quiz score per subject</p>
              </div>
              <BarChart
                data={topicPerformance}
                index="topic"
                categories={['score']}
                fillColors={['#ffe44d']}
                showGrid={true}
              />
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h2 className="chart-title">Quizzes by Subject</h2>
                <p className="chart-description">How many quizzes you took in each subject</p>
              </div>
              <PieChart
                data={quizzesBySubject}
                dataKey="value"
                nameKey="name"
                colors={['#ffe44d', '#4dd4e8', '#ff6b4d', '#b19eef', '#ff4d8f', '#a8e6cf']}
              />
            </div>

            <div className="chart-card chart-card-wide">
              <div className="chart-header">
                <h2 className="chart-title">Weekly Progress Tracker</h2>
                <p className="chart-description">Questions answered and accuracy over time</p>
              </div>
              <LineChart
                data={weeklyProgress}
                index="week"
                categories={['problems', 'accuracy']}
                strokeColors={['#4dd4e8', '#ff6b4d']}
                showGrid={true}
              />
            </div>
          </div>
        )}

        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-icon">
              <ChartBar size={32} weight="bold" />
            </div>
            <div className="summary-content">
              <h3 className="summary-value">{averageScore}%</h3>
              <p className="summary-label">Average Score</p>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">
              <ChatCircle size={32} weight="bold" />
            </div>
            <div className="summary-content">
              <h3 className="summary-value">{stats?.chat_count ?? 0}</h3>
              <p className="summary-label">Chats</p>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">
              <CheckCircle size={32} weight="bold" />
            </div>
            <div className="summary-content">
              <h3 className="summary-value">{totalQuestions}</h3>
              <p className="summary-label">Questions Answered</p>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">
              <Fire size={32} weight="bold" />
            </div>
            <div className="summary-content">
              <h3 className="summary-value">{stats?.streak_days ?? 0}</h3>
              <p className="summary-label">Day Streak</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StatsPage() {
  return (
    <ProtectedRoute>
      <Stats />
    </ProtectedRoute>
  );
}
