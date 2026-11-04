import { useState, useEffect, useCallback } from 'react';
import { MagnifyingGlass, Trash, Clock, ChatCircle, Star, CaretDown, Warning, X } from 'phosphor-react';
import PillNav from '../../components/PillNav';
import { useTranslation } from 'react-i18next';
import { api, type ConversationSummary } from '../../lib/apiClient';
import { errorMessage } from '../../lib/errors';
import { subjectLabel } from '../../lib/stats-view';
import i18n, { localeFor } from '../../i18n';
import { ProtectedRoute } from '../../components/ProtectedRoute';

interface HistoryItem {
  id: string;
  title: string;
  preview: string;
  subject: string;
  is_favorite: boolean;
  updatedAt: Date | null;
  date_bucket: 'today' | 'week' | 'month' | 'older';
}

function toHistoryItem(c: ConversationSummary): HistoryItem {
  const when = new Date(c.updated_at);
  const diffDays = (Date.now() - when.getTime()) / (1000 * 60 * 60 * 24);
  const date_bucket: HistoryItem['date_bucket'] =
    diffDays < 1 ? 'today' : diffDays < 7 ? 'week' : diffDays < 30 ? 'month' : 'older';
  return {
    id: c.id,
    title: c.title,
    preview: c.preview ?? '',
    subject: c.subject || 'General',
    is_favorite: c.is_favorite,
    updatedAt: Number.isNaN(when.getTime()) ? null : when,
    date_bucket,
  };
}

type DateFilter = 'all' | 'favorites' | 'today' | 'week' | 'month';

// Values are the English subject names the API stores; labels are localised at render time.
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
  const { t } = useTranslation();
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <Warning size={32} weight="fill" color="#e53935" />
          <h2 className="modal-title">{t('history.deleteTitle')}</h2>
        </div>
        <p className="modal-text">
          {t('history.deleteBody', { title: item.title })}
        </p>
        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onCancel}>
            <X size={16} weight="bold" />
            {t('common.cancel')}
          </button>
          <button className="modal-btn delete" onClick={onConfirm}>
            <Trash size={16} weight="bold" />
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

function History() {
  const { t, i18n: i18nInstance } = useTranslation();
  const locale = localeFor(i18nInstance.resolvedLanguage || i18nInstance.language);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<DateFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HistoryItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Fetch conversation history from the API
  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const all: ConversationSummary[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 5; page++) {
        const resp = await api.listConversations({ cursor, limit: 50 });
        all.push(...resp.items);
        cursor = resp.next_cursor;
        if (!cursor) break;
      }
      setItems(all.map(toHistoryItem));
    } catch (err) {
      setError(errorMessage(err, i18n.t, 'history.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

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
      matchesFilter = item.date_bucket !== 'older';
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
      await api.deleteConversation(deleteTarget.id);
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    } catch (err) {
      setError(i18n.t('history.deleteFailed', { reason: errorMessage(err, i18n.t, 'history.tryAgain') }));
    } finally {
      setDeletingId(null);
    }
  };

  // Toggle favorite (optimistic)
  const toggleFavorite = async (item: HistoryItem) => {
    const newFav = !item.is_favorite;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_favorite: newFav } : i)));
    try {
      await api.updateConversation(item.id, { is_favorite: newFav });
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
          item={{ ...deleteTarget, title: deleteTarget.title || t('history.untitled') }}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="history-content">
        {/* Header */}
        <div className="history-header">
          <h1 className="history-title">{t('history.title')}</h1>
          <p className="history-subtitle">{t('history.subtitle')}</p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="history-error-banner">
            <Warning size={18} weight="fill" />
            <span>{error}</span>
            <button onClick={fetchHistory}>{t('common.retry')}</button>
          </div>
        )}

        {/* Search and Subject Filter */}
        <div className="history-top-controls">
          <div className="history-search">
            <MagnifyingGlass size={20} weight="bold" />
            <input
              type="text"
              placeholder={t('history.searchPlaceholder')}
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
              <span>{subjectLabel(t, subjectFilter === 'all' ? 'all' : subjectFilter)}</span>
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
                    {subjectLabel(t, subject === 'All Subjects' ? 'all' : subject)}
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
            {t('history.all')}
          </button>
          <button
            className={`history-tab ${filter === 'today' ? 'active' : ''}`}
            onClick={() => setFilter('today')}
          >
            {t('history.today')}
          </button>
          <button
            className={`history-tab ${filter === 'week' ? 'active' : ''}`}
            onClick={() => setFilter('week')}
          >
            {t('history.week')}
          </button>
          <button
            className={`history-tab ${filter === 'month' ? 'active' : ''}`}
            onClick={() => setFilter('month')}
          >
            {t('history.month')}
          </button>
          <button
            className={`history-tab ${filter === 'favorites' ? 'active' : ''}`}
            onClick={() => setFilter('favorites')}
          >
            <Star size={16} weight="fill" />
            {t('history.favorites')}
          </button>
        </div>

        {/* Loading state */}
        {isLoading ? (
          <div className="history-loading">
            <div className="history-loading-dots">
              <span /><span /><span />
            </div>
            <p>{t('history.loading')}</p>
          </div>
        ) : (
          /* History Grid */
          <div className="history-grid">
            {filteredItems.length === 0 ? (
              <div className="history-empty" style={{ gridColumn: '1 / -1' }}>
                <ChatCircle size={64} weight="bold" />
                <p>
                  {items.length === 0 ? t('history.empty') : t('history.noMatch')}
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
                        title={item.is_favorite ? t('history.removeFavorite') : t('history.addFavorite')}
                      >
                        <Star size={18} weight={item.is_favorite ? 'fill' : 'regular'} />
                      </button>
                      <button
                        className="history-card-action delete"
                        onClick={() => setDeleteTarget(item)}
                        title={t('history.deleteConversation')}
                        disabled={deletingId === item.id}
                      >
                        <Trash size={18} weight="bold" />
                      </button>
                    </div>
                  </div>

                  <div className="history-card-subject-badge">{subjectLabel(t, item.subject)}</div>

                  <h3 className="history-card-title">{item.title || t('history.untitled')}</h3>
                  <p className="history-card-preview">{item.preview}</p>

                  <div className="history-card-footer">
                    <div className="history-card-time">
                      <Clock size={14} weight="bold" />
                      <span>{item.updatedAt ? item.updatedAt.toLocaleString(locale) : ''}</span>
                    </div>
                    <div className="history-card-mode-label">{t('history.studyBuddy')}</div>
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

export default function HistoryPage() {
  return (
    <ProtectedRoute>
      <History />
    </ProtectedRoute>
  );
}
