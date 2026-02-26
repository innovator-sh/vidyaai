import { useState } from 'react';
import { ChartBar, Timer, CheckCircle, Target } from 'phosphor-react';
import { BarChart } from '../../components/retroui/charts/BarChart';
import { PieChart } from '../../components/retroui/charts/PieChart';
import { LineChart } from '../../components/retroui/charts/LineChart';
import StaggeredMenu from '../../components/StaggeredMenu';
import { Select } from '../../components/retroui/Select';

export default function Stats() {
  const [selectedSubject, setSelectedSubject] = useState('engineering-math');

  const menuItems = [
    { label: 'Home', ariaLabel: 'Go to home page', link: '/' },
    { label: 'Chat', ariaLabel: 'Chat with AI', link: '/screens/chat' },
    { label: 'Stats', ariaLabel: 'Statistics for Progress', link: '/stats' },
    { label: 'Account', ariaLabel: 'Account Settings', link: '/account' }
  ];

  const socialItems = [
    { label: 'Twitter', link: 'https://twitter.com' },
    { label: 'GitHub', link: 'https://github.com' },
    { label: 'LinkedIn', link: 'https://linkedin.com' }
  ];

  // Topic-wise performance data
  const topicPerformance = [
    { topic: 'Calculus', score: 85, total: 100 },
    { topic: 'Linear Algebra', score: 78, total: 100 },
    { topic: 'Differential Eq', score: 92, total: 100 },
    { topic: 'Probability', score: 88, total: 100 },
    { topic: 'Statistics', score: 75, total: 100 },
    { topic: 'Transforms', score: 82, total: 100 },
  ];

  // Study time distribution
  const studyTimeData = [
    { name: 'Calculus', value: 25 },
    { name: 'Linear Algebra', value: 20 },
    { name: 'Differential Equations', value: 18 },
    { name: 'Probability', value: 15 },
    { name: 'Statistics', value: 12 },
    { name: 'Transforms', value: 10 },
  ];

  // Weekly progress data
  const weeklyProgress = [
    { week: 'Week 1', problems: 12, accuracy: 75 },
    { week: 'Week 2', problems: 18, accuracy: 80 },
    { week: 'Week 3', problems: 15, accuracy: 85 },
    { week: 'Week 4', problems: 22, accuracy: 88 },
    { week: 'Week 5', problems: 25, accuracy: 90 },
    { week: 'Week 6', problems: 28, accuracy: 92 },
  ];

  return (
    <div className="stats-container">
      <StaggeredMenu
        position="right"
        items={menuItems}
        socialItems={socialItems}
        displaySocials
        displayItemNumbering={true}
        menuButtonColor="#2a2a2a"
        openMenuButtonColor="#2a2a2a"
        changeMenuColorOnOpen={false}
        colors={['#FF3D9A', '#0066FF']}
        logoUrl="/vidyaa-logo.svg"
        accentColor="#0066FF"
        onMenuOpen={() => console.log('Menu opened')}
        onMenuClose={() => console.log('Menu closed')}
        isFixed={true}
      />

      <div className="stats-content">
        <div className="stats-header">
          <h1 className="stats-title">Engineering Mathematics</h1>
          <p className="stats-subtitle">Your Learning Progress Dashboard</p>
          
          <div className="subject-selector">
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <Select.Trigger className="subject-select-trigger">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="engineering-math">
                  <span>Engineering Mathematics</span>
                </Select.Item>
                <Select.Item value="physics">
                  <span>Physics</span>
                </Select.Item>
                <Select.Item value="chemistry">
                  <span>Chemistry</span>
                </Select.Item>
                <Select.Item value="computer-science">
                  <span>Computer Science</span>
                </Select.Item>
                <Select.Item value="electronics">
                  <span>Electronics</span>
                </Select.Item>
                <Select.Item value="mechanics">
                  <span>Mechanics</span>
                </Select.Item>
              </Select.Content>
            </Select>
          </div>
        </div>

        <div className="stats-grid">
          {/* Topic Performance Bar Chart */}
          <div className="chart-card">
            <div className="chart-header">
              <h2 className="chart-title">Topic-wise Performance</h2>
              <p className="chart-description">Your scores across different topics</p>
            </div>
            <BarChart
              data={topicPerformance}
              index="topic"
              categories={['score']}
              fillColors={['#ffe44d']}
              showGrid={true}
            />
          </div>

          {/* Study Time Pie Chart */}
          <div className="chart-card">
            <div className="chart-header">
              <h2 className="chart-title">Study Time Distribution</h2>
              <p className="chart-description">Hours spent on each topic</p>
            </div>
            <PieChart
              data={studyTimeData}
              dataKey="value"
              nameKey="name"
              colors={['#ffe44d', '#4dd4e8', '#ff6b4d', '#b19eef', '#ff4d8f', '#a8e6cf']}
            />
          </div>

          {/* Weekly Progress Line Chart */}
          <div className="chart-card chart-card-wide">
            <div className="chart-header">
              <h2 className="chart-title">Weekly Progress Tracker</h2>
              <p className="chart-description">Problems solved and accuracy over time</p>
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

        {/* Stats Summary Cards */}
        <div className="summary-cards">
          <div className="summary-card">
            <div className="summary-icon">
              <ChartBar size={32} weight="bold" />
            </div>
            <div className="summary-content">
              <h3 className="summary-value">83.3%</h3>
              <p className="summary-label">Average Score</p>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">
              <Timer size={32} weight="bold" />
            </div>
            <div className="summary-content">
              <h3 className="summary-value">120 hrs</h3>
              <p className="summary-label">Total Study Time</p>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">
              <CheckCircle size={32} weight="bold" />
            </div>
            <div className="summary-content">
              <h3 className="summary-value">120</h3>
              <p className="summary-label">Problems Solved</p>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon">
              <Target size={32} weight="bold" />
            </div>
            <div className="summary-content">
              <h3 className="summary-value">92%</h3>
              <p className="summary-label">Current Accuracy</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
