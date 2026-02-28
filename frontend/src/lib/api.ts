/**
 * API Client Module
 *
 * Typed methods for backend API calls.
 * Session token and user ID are read from localStorage (set by AuthContext).
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const SESSION_KEY = 'vidyaai_session_token';
const USER_KEY = 'vidyaai_user';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SessionStartParams {
  sessionId: string;
  documentText: string;
  queryText: string;
}

export interface FollowUpParams {
  sessionId: string;
  queryText: string;
}

export interface SessionEndParams {
  sessionId: string;
}

export interface RootCauseAnalysis {
  core_gap: string;
  misconception?: string;
  topic_area: string;
  reasoning: string;
}

export interface SessionStartResponse {
  session_id: string;
  root_cause_analysis: RootCauseAnalysis;
  background_concepts: string[];
  solution: string;
  improvement_advice?: string;
}

export interface FollowUpResponse {
  solution: string;
  improvement_advice?: string;
}

export interface SessionEndResponse {
  status: string;
  summary: string;
}

export interface HistoryItem {
  id: string;
  title: string;
  preview: string;
  timestamp: string;
  timestamp_iso: string;
  subject: string;
  is_favorite: boolean;
  isFavorite?: boolean;
  session_id: string;
  date: string;
  date_bucket?: 'today' | 'week' | 'month';
}

export interface HistoryResponse {
  items: HistoryItem[];
  total: number;
}

// ── APIClient ─────────────────────────────────────────────────────────────

export class APIClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /** Read the current user_id from localStorage */
  private getUserId(): string {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.uid) return u.uid;
      }
    } catch { /* ignore */ }
    throw new Error('User not authenticated');
  }

  /** Read the current session token from localStorage */
  private getSessionToken(): string {
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) throw new Error('User not authenticated');
    return token;
  }

  /** Make a request to a backend endpoint (absolute via baseUrl) */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) throw new Error('Authentication failed. Please sign in again.');
        if (response.status === 403) throw new Error("You don't have permission to access this resource.");
        if (response.status === 404) throw new Error(errorData.detail || 'Resource not found.');
        if (response.status === 503) throw new Error('Service temporarily unavailable. Please try again.');
        throw new Error(errorData.detail || 'An error occurred. Please try again.');
      }

      return await response.json();
    } catch (error: any) {
      if (error.message === 'Failed to fetch') {
        throw new Error('Unable to connect to server. Please check your internet connection.');
      }
      throw error;
    }
  }

  /** Make a request through a Next.js API proxy (relative URL, same origin — avoids CORS) */
  private async proxyRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    try {
      const response = await fetch(path, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.detail || 'Request failed');
      }
      return await response.json();
    } catch (error: any) {
      if (error.message === 'Failed to fetch') {
        throw new Error('Unable to connect to server. Please check your internet connection.');
      }
      throw error;
    }
  }

  async startSession(params: SessionStartParams): Promise<SessionStartResponse> {
    const userId = this.getUserId();
    return this.request<SessionStartResponse>('/rag/session/start', {
      method: 'POST',
      body: JSON.stringify({
        firebase_uid: userId,
        session_id: params.sessionId,
        document_text: params.documentText,
        query_text: params.queryText,
      }),
    });
  }

  async sendFollowUp(params: FollowUpParams): Promise<FollowUpResponse> {
    const userId = this.getUserId();
    return this.request<FollowUpResponse>('/rag/session/followup', {
      method: 'POST',
      body: JSON.stringify({
        firebase_uid: userId,
        session_id: params.sessionId,
        query_text: params.queryText,
      }),
    });
  }

  async endSession(params: SessionEndParams): Promise<SessionEndResponse> {
    const userId = this.getUserId();
    return this.request<SessionEndResponse>('/rag/session/end', {
      method: 'POST',
      body: JSON.stringify({
        firebase_uid: userId,
        session_id: params.sessionId,
      }),
    });
  }

  async getChatHistory(limit: number = 50): Promise<HistoryResponse> {
    const userId = this.getUserId();
    // Proxy through Next.js to avoid browser CORS
    const data = await this.proxyRequest<{ history: any[] }>(
      `/api/history?firebase_uid=${encodeURIComponent(userId)}&limit=${limit}`
    );
    const raw = data.history || [];

    // Normalise backend shape → HistoryItem shape expected by history.tsx
    const now = new Date();
    const items: HistoryItem[] = raw.map((entry: any) => {
      const dateStr: string = entry.date || entry.timestamp || '';
      const entryDate = dateStr ? new Date(dateStr) : null;
      let date_bucket: 'today' | 'week' | 'month' = 'month';
      if (entryDate) {
        const diffMs = now.getTime() - entryDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays < 1) date_bucket = 'today';
        else if (diffDays < 7) date_bucket = 'week';
      }
      return {
        id: entry.id || String(Math.random()),
        title: entry.title || 'Chat Session',
        preview: entry.preview || '',
        subject: entry.subject || 'General',
        date: dateStr,
        timestamp: dateStr,
        timestamp_iso: dateStr,
        session_id: entry.session_id || '',
        is_favorite: entry.is_favorite ?? entry.isFavorite ?? false,
        isFavorite: entry.isFavorite ?? entry.is_favorite ?? false,
        date_bucket,
      };
    });

    return { items, total: items.length };
  }

  async deleteHistoryEntry(docId: string): Promise<{ status: string; id: string }> {
    const userId = this.getUserId();
    // Proxy through Next.js to avoid browser CORS
    return this.proxyRequest<{ status: string; id: string }>(
      `/api/history?firebase_uid=${encodeURIComponent(userId)}&id=${encodeURIComponent(docId)}`,
      { method: 'DELETE' }
    );
  }

  async toggleHistoryFavorite(
    docId: string,
    isFavorite: boolean
  ): Promise<{ status: string; id: string; is_favorite: boolean }> {
    const userId = this.getUserId();
    return this.request<{ status: string; id: string; is_favorite: boolean }>(
      `/rag/session/history/${encodeURIComponent(docId)}/favorite?firebase_uid=${encodeURIComponent(userId)}&is_favorite=${isFavorite}`,
      { method: 'PATCH' }
    );
  }
}

// Singleton
export const apiClient = new APIClient();
