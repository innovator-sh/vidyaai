import { useState } from 'react';
import { MagnifyingGlass, Trash, Clock, ChatCircle, Star, CaretDown } from 'phosphor-react';
import PillNav from '../../components/PillNav';

interface HistoryItem {
  id: string;
  title: string;
  preview: string;
  timestamp: string;
  isFavorite: boolean;
  mode: 'study-buddy' | 'teacher' | 'mentor';
  date: string;
  subject: string;
}

export default function History() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'favorites' | 'today' | 'week' | 'month'>('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);

  const subjects = [
    'All Subjects',
    'Mathematics',
    'Physics',
    'Chemistry',
    'Biology',
    'History',
    'English',
    'Computer Science',
    'Economics',
  ];

  const historyItems: HistoryItem[] = [
    {
      id: '1',
      title: 'Calculus 101: Integrals',
      preview: 'Explain the fundamental theorem of calculus and how to solve definite integrals...',
      timestamp: '2 hours ago',
      isFavorite: true,
      mode: 'teacher',
      date: 'today',
      subject: 'Mathematics',
    },
    {
      id: '2',
      title: 'History: Industrial Revolution',
      preview: 'What were the main causes and effects of the Industrial Revolution in Europe?',
      timestamp: '5 hours ago',
      isFavorite: false,
      mode: 'study-buddy',
      date: 'today',
      subject: 'History',
    },
    {
      id: '3',
      title: 'English Essay Outline',
      preview: 'Help me create an outline for my essay on Shakespeare\'s Hamlet...',
      timestamp: 'Yesterday',
      isFavorite: true,
      mode: 'mentor',
      date: 'week',
      subject: 'English',
    },
    {
      id: '4',
      title: 'Physics: Newton\'s Laws',
      preview: 'Explain Newton\'s three laws of motion with real-world examples...',
      timestamp: 'Yesterday',
      isFavorite: false,
      mode: 'teacher',
      date: 'week',
      subject: 'Physics',
    },
    {
      id: '5',
      title: 'Chemistry: Organic Compounds',
      preview: 'What are the different types of organic compounds and their properties?',
      timestamp: '2 days ago',
      isFavorite: true,
      mode: 'study-buddy',
      date: 'week',
      subject: 'Chemistry',
    },
    {
      id: '6',
      title: 'Math: Trigonometry',
      preview: 'Help me understand sine, cosine, and tangent functions...',
      timestamp: '3 days ago',
      isFavorite: false,
      mode: 'teacher',
      date: 'week',
      subject: 'Mathematics',
    },
    {
      id: '7',
      title: 'Biology: Cell Division',
      preview: 'Explain the process of mitosis and meiosis with diagrams...',
      timestamp: '4 days ago',
      isFavorite: false,
      mode: 'study-buddy',
      date: 'week',
      subject: 'Biology',
    },
    {
      id: '8',
      title: 'Computer Science: Algorithms',
      preview: 'What is the difference between sorting algorithms like bubble sort and quick sort?',
      timestamp: '5 days ago',
      isFavorite: true,
      mode: 'mentor',
      date: 'week',
      subject: 'Computer Science',
    },
    {
      id: '9',
      title: 'Economics: Supply & Demand',
      preview: 'Explain the relationship between supply and demand in market economics...',
      timestamp: '2 weeks ago',
      isFavorite: false,
      mode: 'teacher',
      date: 'month',
      subject: 'Economics',
    },
    {
      id: '10',
      title: 'Literature: Poetry Analysis',
      preview: 'Help me analyze the themes and literary devices in Robert Frost\'s poems...',
      timestamp: '3 weeks ago',
      isFavorite: true,
      mode: 'mentor',
      date: 'month',
      subject: 'English',
    },
  ];

  const filteredItems = historyItems.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.preview.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesFilter = true;
    if (filter === 'favorites') {
      matchesFilter = item.isFavorite;
    } else if (filter === 'today') {
      matchesFilter = item.date === 'today';
    } else if (filter === 'week') {
      matchesFilter = item.date === 'today' || item.date === 'week';
    } else if (filter === 'month') {
      matchesFilter = true;
    }

    const matchesSubject = subjectFilter === 'all' || item.subject === subjectFilter;
    
    return matchesSearch && matchesFilter && matchesSubject;
  });

  const handleDelete = (id: string) => {
    console.log('Delete item:', id);
  };

  const toggleFavorite = (id: string) => {
    console.log('Toggle favorite:', id);
  };

  return (
    <div className="history-container">
      <PillNav />

      <div className="history-content">
        {/* Header */}
        <div className="history-header">
          <h1 className="history-title">Chat History</h1>
          <p className="history-subtitle">Your conversation timeline</p>
        </div>

        {/* Search and Subject Filter */}
        <div className="history-top-controls">
          <div className="history-search">
            <MagnifyingGlass size={20} weight="bold" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="history-search-input"
            />
          </div>

          <div className="subject-filter-wrapper">
            <button
              className="subject-filter-btn"
              onClick={() => setShowSubjectDropdown(!showSubjectDropdown)}
            >
              <span>{subjectFilter === 'all' ? 'All Subjects' : subjectFilter}</span>
              <CaretDown size={16} weight="bold" />
            </button>
            {showSubjectDropdown && (
              <div className="subject-dropdown">
                {subjects.map((subject) => (
                  <button
                    key={subject}
                    className={`subject-dropdown-item ${
                      (subject === 'All Subjects' && subjectFilter === 'all') ||
                      subject === subjectFilter
                        ? 'active'
                        : ''
                    }`}
                    onClick={() => {
                      setSubjectFilter(subject === 'All Subjects' ? 'all' : subject);
                      setShowSubjectDropdown(false);
                    }}
                  >
                    {subject}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="history-filter-tabs">
          <button
            className={`history-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`history-tab ${filter === 'today' ? 'active' : ''}`}
            onClick={() => setFilter('today')}
          >
            Today
          </button>
          <button
            className={`history-tab ${filter === 'week' ? 'active' : ''}`}
            onClick={() => setFilter('week')}
          >
            This Week
          </button>
          <button
            className={`history-tab ${filter === 'month' ? 'active' : ''}`}
            onClick={() => setFilter('month')}
          >
            This Month
          </button>
          <button
            className={`history-tab ${filter === 'favorites' ? 'active' : ''}`}
            onClick={() => setFilter('favorites')}
          >
            <Star size={16} weight="fill" />
            Favorites
          </button>
        </div>

        {/* History Grid */}
        <div className="history-grid">
          {filteredItems.length === 0 ? (
            <div className="history-empty">
              <ChatCircle size={64} weight="bold" />
              <p>No conversations found</p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <div key={item.id} className="history-card">
                <div className="history-card-header">
                  <div className="history-card-mode">
                    <img src={`/${item.mode}.svg`} alt={item.mode} className="history-card-mode-icon" />
                  </div>
                  <div className="history-card-actions">
                    <button
                      className={`history-card-action favorite ${item.isFavorite ? 'active' : ''}`}
                      onClick={() => toggleFavorite(item.id)}
                      title={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star size={18} weight={item.isFavorite ? 'fill' : 'regular'} />
                    </button>
                    <button
                      className="history-card-action delete"
                      onClick={() => handleDelete(item.id)}
                      title="Delete conversation"
                    >
                      <Trash size={18} weight="bold" />
                    </button>
                  </div>
                </div>

                <div className="history-card-subject-badge">{item.subject}</div>

                <h3 className="history-card-title">{item.title}</h3>
                <p className="history-card-preview">{item.preview}</p>

                <div className="history-card-footer">
                  <div className="history-card-time">
                    <Clock size={14} weight="bold" />
                    <span>{item.timestamp}</span>
                  </div>
                  <div className="history-card-mode-label">
                    {item.mode === 'study-buddy' ? 'Study Buddy' : 
                     item.mode === 'teacher' ? 'Teacher' : 'Mentor'}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
