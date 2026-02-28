import { useState, useEffect, useCallback } from 'react';
import { MagnifyingGlass, Trash, Clock, ChatCircle, Star, CaretDown, Warning, X } from 'phosphor-react';
import PillNav from '../../components/PillNav';
import { apiClient, HistoryItem } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

type DateFilter = 'all' | 'favorites' | 'today' | 'week' | 'month';

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
  'General',
];

// Delete Confirmation Modal
function DeleteConfirmModal({
  item,
  onConfirm,
  onCancel,
}: {
  item: HistoryItem;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <Warning size={32} weight="fill" color="#e53935" />
          <h2 className="modal-title">Delete this chat?</h2>
        </div>
        <p className="modal-text">
          &ldquo;{item.title}&rdquo; will be permanently removed from your history. This cannot be undone.
        </p>
        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onCancel}>
            <X size={16} weight="bold" />
            Cancel
          </button>
          <button className="modal-btn delete" onClick={onConfirm}>
            <Trash size={16} weight="bold" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function History() {
  const { user } = useAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<DateFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HistoryItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch real history from ChromaDB via backend
  const fetchHistory = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const resp = await apiClient.getChatHistory(100);
      setItems(resp.items);
    } catch (err: any) {
      setError(err.message || 'Failed to load history. Make sure the backend is running.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Apply all filters
  const filteredItems = items.filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      item.title.toLowerCase().includes(q) || item.preview.toLowerCase().includes(q);

    let matchesFilter = true;
    if (filter === 'favorites') {
      matchesFilter = item.is_favorite;
    } else if (filter === 'today') {
      matchesFilter = item.date_bucket === 'today';
    } else if (filter === 'week') {
      matchesFilter = item.date_bucket === 'today' || item.date_bucket === 'week';
    } else if (filter === 'month') {
      matchesFilter = true;
    }

    const matchesSubject = subjectFilter === 'all' || item.subject === subjectFilter;
    return matchesSearch && matchesFilter && matchesSubject;
  });

  // Confirm deletion
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setDeleteTarget(null);
    try {
      await apiClient.deleteHistoryEntry(deleteTarget.id);
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    } catch (err: any) {
      setError(`Failed to delete: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  // Toggle favorite (optimistic)
  const toggleFavorite = async (item: HistoryItem) => {
    const newFav = !item.is_favorite;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_favorite: newFav } : i)));
    try {
      await apiClient.toggleHistoryFavorite(item.id, newFav);
    } catch {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_favorite: !newFav } : i)));
    }
  };

  return (
    <div className="history-container">
      <PillNav />

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          item={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="history-content">
        {/* Header */}
        <div className="history-header">
          <h1 className="history-title">Chat History</h1>
          <p className="history-subtitle">Your conversation timeline</p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="history-error-banner">
            <Warning size={18} weight="fill" />
            <span>{error}</span>
            <button onClick={fetchHistory}>Retry</button>
          </div>
        )}

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
                    className={`subject-dropdown-item ${(subject === 'All Subjects' && subjectFilter === 'all') ||
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

        {/* Loading state */}
        {isLoading ? (
          <div className="history-loading">
            <div className="history-loading-dots">
              <span /><span /><span />
            </div>
            <p>Loading your history…</p>
          </div>
        ) : (
          /* History Grid */
          <div className="history-grid">
            {filteredItems.length === 0 ? (
              <div className="history-empty" style={{ gridColumn: '1 / -1' }}>
                <ChatCircle size={64} weight="bold" />
                <p>
                  {items.length === 0
                    ? 'No chats yet — start a conversation to build your history!'
                    : 'No conversations match your filters.'}
                </p>
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`history-card ${deletingId === item.id ? 'deleting' : ''}`}
                >
                  <div className="history-card-header">
                    {/* Mode icon — default to study-buddy since we don't track mode in DB */}
                    <div className="history-card-mode">
                      <img
                        src="/study-buddy.svg"
                        alt="study-buddy"
                        className="history-card-mode-icon"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                    <div className="history-card-actions">
                      <button
                        className={`history-card-action favorite ${item.is_favorite ? 'active' : ''}`}
                        onClick={() => toggleFavorite(item)}
                        title={item.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star size={18} weight={item.is_favorite ? 'fill' : 'regular'} />
                      </button>
                      <button
                        className="history-card-action delete"
                        onClick={() => setDeleteTarget(item)}
                        title="Delete conversation"
                        disabled={deletingId === item.id}
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
                    <div className="history-card-mode-label">Study Buddy</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
