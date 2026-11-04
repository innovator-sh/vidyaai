import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartBar, ChatCircle, CheckCircle, Fire, Timer } from 'phosphor-react';
import { BarChart } from '../../components/retroui/charts/BarChart';
import { PieChart } from '../../components/retroui/charts/PieChart';
import { LineChart } from '../../components/retroui/charts/LineChart';
import PillNav from '../../components/PillNav';
import { Select } from '../../components/retroui/Select';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { api, type Stats as StatsResponse } from '../../lib/apiClient';
import { errorMessage } from '../../lib/errors';
import { ALL_SUBJECTS, buildStatsView, formatMinutes, subjectLabel } from '../../lib/stats-view';
import i18n, { localeFor } from '../../i18n';

const PIE_COLORS = ['#ffe44d', '#4dd4e8', '#ff6b4d', '#b19eef', '#ff4d8f', '#a8e6cf'];

function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="chart-empty" role="status">
      {children}
    </p>
  );
}

function Stats() {
  const { t, i18n: i18nInstance } = useTranslation();
  const locale = localeFor(i18nInstance.resolvedLanguage || i18nInstance.language);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState(ALL_SUBJECTS);
  const [renderedAt] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    api
      .getStats()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, i18n.t, 'stats.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const view = useMemo(
    () => buildStatsView(stats, { subject: selectedSubject, now: renderedAt, locale, t }),
    [stats, selectedSubject, renderedAt, locale, t],
  );

  const showGrid = !loading && !error && !view.isEmpty;

  return (
    <div className="stats-container">
      <PillNav />

      <div className="stats-content">
        <div className="stats-header">
          <h1 className="stats-title">{t('stats.title')}</h1>
          <p className="stats-subtitle">{t('stats.dashboard')}</p>

          <div className="subject-selector">
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <Select.Trigger className="subject-select-trigger">
                <Select.Value />
              </Select.Trigger>
              <Select.Content className="subject-select-content">
                <Select.Item value={ALL_SUBJECTS} className="subject-select-item">
                  <span>{t('subjects.all')}</span>
                </Select.Item>
                {view.subjects.map((subject) => (
                  <Select.Item key={subject} value={subject} className="subject-select-item">
                    <span>{subjectLabel(t, subject)}</span>
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </div>

        {error && (
          <p role="alert" style={{ color: '#c00', fontFamily: 'Sora, sans-serif', marginBottom: 16 }}>{error}</p>
        )}
        {loading && <p style={{ fontFamily: 'Sora, sans-serif' }}>{t('stats.loading')}</p>}
        {!loading && !error && view.isEmpty && (
          <p style={{ fontFamily: 'Sora, sans-serif', marginBottom: 16 }}>{t('stats.emptyAll')}</p>
        )}

        {showGrid && (
          <div className="stats-grid">
            <div className="chart-card">
              <div className="chart-header">
                <h2 className="chart-title">{t('stats.topicPerf')}</h2>
                <p className="chart-description">{t('stats.topicDesc')}</p>
              </div>
              {view.hasQuizData ? (
                <BarChart
                  data={view.topicPerformance}
                  index="topic"
                  categories={['score']}
                  indexLabel={t('stats.topicPerf')}
                  categoryLabels={{ score: t('stats.avgScore') }}
                  valueFormatter={(v) => `${v}%`}
                  fillColors={['#ffe44d']}
                  showGrid={true}
                />
              ) : (
                <ChartEmpty>{t('stats.noQuizzes')}</ChartEmpty>
              )}
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h2 className="chart-title">{t('stats.studyTime')}</h2>
                <p className="chart-description">{t('stats.studyDesc')}</p>
              </div>
              {view.hasStudyTime ? (
                <PieChart
                  data={view.studyTime}
                  dataKey="value"
                  nameKey="name"
                  valueFormatter={(v) => formatMinutes(t, v)}
                  colors={PIE_COLORS}
                />
              ) : (
                <ChartEmpty>{t('stats.studyEmpty')}</ChartEmpty>
              )}
            </div>

            <div className="chart-card chart-card-wide">
              <div className="chart-header">
                <h2 className="chart-title">{t('stats.weeklyActivity')}</h2>
                <p className="chart-description">{t('stats.weeklyActivityDesc')}</p>
              </div>
              {view.hasWeeklyActivity ? (
                <BarChart
                  data={view.weeklyActivity}
                  index="day"
                  categories={['messages']}
                  indexLabel={t('stats.weeklyActivity')}
                  categoryLabels={{ messages: t('stats.messages') }}
                  fillColors={['#4dd4e8']}
                  showGrid={true}
                />
              ) : (
                <ChartEmpty>{t('stats.weeklyActivityEmpty')}</ChartEmpty>
              )}
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h2 className="chart-title">{t('stats.chatsBySubject')}</h2>
                <p className="chart-description">{t('stats.chatsBySubjectDesc')}</p>
              </div>
              {view.hasChatsBySubject ? (
                <BarChart
                  data={view.chatsBySubject}
                  index="name"
                  categories={['value']}
                  indexLabel={t('stats.chatsBySubject')}
                  categoryLabels={{ value: t('stats.chats') }}
                  fillColors={['#b19eef']}
                  showGrid={true}
                />
              ) : (
                <ChartEmpty>{t('stats.chatsBySubjectEmpty')}</ChartEmpty>
              )}
            </div>

            <div className="chart-card">
              <div className="chart-header">
                <h2 className="chart-title">{t('stats.quizzesBySubject')}</h2>
                <p className="chart-description">{t('stats.quizzesBySubjectDesc')}</p>
              </div>
              {view.hasQuizData ? (
                <PieChart
                  data={view.quizzesBySubject}
                  dataKey="value"
                  nameKey="name"
                  colors={PIE_COLORS}
                />
              ) : (
                <ChartEmpty>{t('stats.noQuizzes')}</ChartEmpty>
              )}
            </div>

            <div className="chart-card chart-card-wide">
              <div className="chart-header">
                <h2 className="chart-title">{t('stats.weeklyProg')}</h2>
                <p className="chart-description">{t('stats.weeklyDesc')}</p>
              </div>
              {view.hasQuizData ? (
                <LineChart
                  data={view.weeklyProgress}
                  index="week"
                  categories={['problems', 'accuracy']}
                  indexLabel={t('stats.weeklyProg')}
                  categoryLabels={{ problems: t('stats.questions'), accuracy: t('stats.accuracyShort') }}
                  strokeColors={['#4dd4e8', '#ff6b4d']}
                  showGrid={true}
                />
              ) : (
                <ChartEmpty>{t('stats.noQuizzes')}</ChartEmpty>
              )}
            </div>
          </div>
        )}

        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-icon">
              <ChartBar size={32} weight="bold" />
            </div>
            <div className="summary-content">
              <h3 className="summary-value">{view.quizAccuracy === null ? '—' : `${view.quizAccuracy}%`}</h3>
              <p className="summary-label">{t('stats.quizAccuracy')}</p>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">
              <ChatCircle size={32} weight="bold" />
            </div>
            <div className="summary-content">
              <h3 className="summary-value">{view.chatCount}</h3>
              <p className="summary-label">{t('stats.chats')}</p>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">
              <CheckCircle size={32} weight="bold" />
            </div>
            <div className="summary-content">
              <h3 className="summary-value">{view.totalQuestions}</h3>
              <p className="summary-label">{t('stats.questionsAnswered')}</p>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">
              <Timer size={32} weight="bold" />
            </div>
            <div className="summary-content">
              <h3 className="summary-value">{view.hasStudyTime ? formatMinutes(t, view.totalStudyMinutes) : '—'}</h3>
              <p className="summary-label">{t('stats.totalStudy')}</p>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">
              <Fire size={32} weight="bold" />
            </div>
            <div className="summary-content">
              <h3 className="summary-value">{view.streakDays}</h3>
              <p className="summary-label">{t('stats.streak')}</p>
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
