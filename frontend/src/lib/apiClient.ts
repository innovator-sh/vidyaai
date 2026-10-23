/**
 * Typed client for the VidyaAI /v1 API (see .dev/specs/api-contract.md).
 *
 * - Every request carries `Authorization: Bearer <Firebase ID token>`.
 * - On a 401 the token is force-refreshed and the request is retried once.
 * - Errors are normalised from the `{"error":{"code","message"}}` envelope into ApiError.
 * - /v1/chat is consumed as Server-Sent Events via fetch + ReadableStream (AbortController friendly).
 * - Chat messages carry a client-generated UUID (`message_id`) used by the server as an idempotency key.
 */

import { auth } from './firebase';

// ── Config ─────────────────────────────────────────────────────────────────

/** Base URL of the API. No localhost fallback outside of `next dev`. */
export function resolveApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (url) return url.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'development') return 'http://localhost:8000';
  return '';
}

// ── Types (mirror the contract) ────────────────────────────────────────────

export type Persona = 'study-buddy' | 'teacher' | 'mentor';

export interface Me {
  id: string;
  email: string | null;
  display_name: string | null;
  course: string | null;
  degree: string | null;
  college: string | null;
  location: string | null;
  created_at: string;
}

export type MeUpdate = Partial<Pick<Me, 'display_name' | 'course' | 'degree' | 'college' | 'location'>>;

export interface ChatRequest {
  conversation_id?: string | null;
  /** Client generated idempotency key. Generated automatically when omitted. */
  message_id?: string;
  message: string;
  persona?: Persona;
  document_id?: string | null;
  language?: string | null;
  history_window?: number | null;
}

export type ChatEvent =
  | { type: 'meta'; conversation_id: string; user_message_id: string }
  | { type: 'token'; text: string }
  | { type: 'done'; assistant_message_id: string; title: string };

export interface ConversationSummary {
  id: string;
  title: string;
  subject: string | null;
  persona: Persona | string | null;
  is_favorite: boolean;
  updated_at: string;
  preview: string | null;
}

export interface ConversationList {
  items: ConversationSummary[];
  next_cursor: string | null;
}

export interface ChatMessageRecord {
  id: string;
  role: 'user' | 'assistant' | string;
  content: string;
  created_at: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  subject: string | null;
  persona: Persona | string | null;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  messages: ChatMessageRecord[];
}

export type DocumentStatus = 'processing' | 'ready' | 'failed';

export interface DocumentRecord {
  id: string;
  name: string;
  status: DocumentStatus;
  created_at?: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer_index: number;
  explanation: string;
}

export interface QuizResultInput {
  score: number;
  total: number;
  subject?: string | null;
}

export interface QuizResultRecord {
  id?: string;
  score: number;
  total: number;
  subject?: string | null;
  created_at?: string;
}

export interface Stats {
  quiz_results: QuizResultRecord[];
  chat_count: number;
  streak_days: number;
}

// ── Errors ─────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: number;

  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const FALLBACK_MESSAGES: Record<number, string> = {
  401: 'Your session has expired. Please sign in again.',
  404: 'That item could not be found.',
  413: 'That file or message is too large.',
  422: 'The request was not valid.',
  429: 'You are going a little fast. Please wait a moment and try again.',
};

async function toApiError(res: Response): Promise<ApiError> {
  let code = 'http_error';
  let message = '';
  try {
    const body = await res.json();
    if (body && typeof body === 'object' && body.error && typeof body.error === 'object') {
      code = String(body.error.code ?? code);
      message = String(body.error.message ?? '');
    }
  } catch {
    /* non-JSON body */
  }
  if (!message) {
    message = FALLBACK_MESSAGES[res.status] ?? (res.status >= 500 ? 'The server had a problem. Please try again.' : 'Request failed.');
  }
  const ra = res.headers.get('Retry-After');
  const retryAfter = ra && !Number.isNaN(Number(ra)) ? Number(ra) : undefined;
  return new ApiError(res.status, code, message, retryAfter);
}

const NETWORK_ERROR = () => new ApiError(0, 'network_error', 'Unable to reach the server. Please check your connection.');

// ── SSE parsing ────────────────────────────────────────────────────────────

export interface SseFrame {
  event: string;
  data: string;
}

/** Parses a text/event-stream body into frames. Handles CRLF, multi-line data and split chunks. */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const frame = parseFrame(raw);
        if (frame) yield frame;
      }
    }
    buffer += decoder.decode();
    const tail = parseFrame(buffer.replace(/\r\n/g, '\n'));
    if (tail) yield tail;
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
  }
}

function parseFrame(raw: string): SseFrame | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let val = colon === -1 ? '' : line.slice(colon + 1);
    if (val.startsWith(' ')) val = val.slice(1);
    if (field === 'event') event = val;
    else if (field === 'data') data.push(val);
  }
  if (!data.length) return null;
  return { event, data: data.join('\n') };
}

// ── Client ─────────────────────────────────────────────────────────────────

export interface ApiClientOptions {
  baseUrl?: string;
  /** Returns a Firebase ID token; `forceRefresh` must bypass any cache. */
  getToken?: (forceRefresh?: boolean) => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

async function defaultGetToken(forceRefresh = false): Promise<string | null> {
  const user = auth?.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export function newMessageId(): string {
  return crypto.randomUUID();
}

interface RequestOptions {
  method?: string;
  json?: unknown;
  form?: FormData;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getToken: (forceRefresh?: boolean) => Promise<string | null>;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApiClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? resolveApiUrl()).replace(/\/+$/, '');
    this.getToken = opts.getToken ?? defaultGetToken;
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
  }

  /** Low-level authenticated fetch with a single refresh-and-retry on 401. */
  private async send(path: string, opts: RequestOptions = {}): Promise<Response> {
    const attempt = async (forceRefresh: boolean): Promise<Response> => {
      const token = await this.getToken(forceRefresh);
      const headers: Record<string, string> = { ...(opts.headers ?? {}) };
      if (token) headers.Authorization = `Bearer ${token}`;
      let body: BodyInit | undefined;
      if (opts.form) {
        body = opts.form; // browser sets the multipart boundary
      } else if (opts.json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(opts.json);
      }
      try {
        return await this.fetchImpl(`${this.baseUrl}${path}`, {
          method: opts.method ?? 'GET',
          headers,
          body,
          signal: opts.signal,
        });
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') throw err;
        throw NETWORK_ERROR();
      }
    };

    let res = await attempt(false);
    if (res.status === 401) {
      res = await attempt(true);
    }
    if (!res.ok) throw await toApiError(res);
    return res;
  }

  private async json<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const res = await this.send(path, opts);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(res.status, 'bad_response', 'The server returned an unreadable response.');
    }
  }

  // Account
  getMe = () => this.json<Me>('/v1/me');
  updateMe = (patch: MeUpdate) => this.json<Me>('/v1/me', { method: 'PATCH', json: patch });
  deleteMe = () => this.json<void>('/v1/me', { method: 'DELETE' });
  exportMe = () => this.json<unknown>('/v1/me/export');

  // Chat (SSE)
  /**
   * Streams a chat turn. Yields `meta`, then `token`s, then `done`.
   * Throws ApiError for HTTP errors, for an in-stream `error` event, or if the stream ends early.
   * Abort via `signal`. A `message_id` is generated if absent; pass the same one on retry.
   */
  async *chat(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    const body = { ...req, message_id: req.message_id ?? newMessageId() };
    const res = await this.send('/v1/chat', {
      method: 'POST',
      json: body,
      signal,
      headers: { Accept: 'text/event-stream' },
    });
    if (!res.body) throw new ApiError(res.status, 'no_stream', 'The server returned an empty response.');

    let finished = false;
    for await (const frame of parseSSE(res.body)) {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(frame.data);
      } catch {
        continue; // ignore keep-alives / malformed frames
      }
      switch (frame.event) {
        case 'meta':
          yield {
            type: 'meta',
            conversation_id: String(payload.conversation_id),
            user_message_id: String(payload.user_message_id),
          };
          break;
        case 'token':
          yield { type: 'token', text: String(payload.text ?? '') };
          break;
        case 'done':
          finished = true;
          yield {
            type: 'done',
            assistant_message_id: String(payload.assistant_message_id),
            title: String(payload.title ?? ''),
          };
          break;
        case 'error':
          throw new ApiError(
            res.status,
            String(payload.code ?? 'stream_error'),
            String(payload.message ?? 'The response was interrupted.'),
          );
        default:
          break;
      }
    }
    if (!finished) {
      throw new ApiError(res.status, 'stream_interrupted', 'The response ended unexpectedly. Please try again.');
    }
  }

  // Conversations
  listConversations = (params: { cursor?: string | null; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.cursor) q.set('cursor', params.cursor);
    q.set('limit', String(params.limit ?? 20));
    return this.json<ConversationList>(`/v1/conversations?${q.toString()}`);
  };
  getConversation = (id: string) => this.json<ConversationDetail>(`/v1/conversations/${encodeURIComponent(id)}`);
  updateConversation = (id: string, patch: { title?: string; is_favorite?: boolean }) =>
    this.json<ConversationSummary | void>(`/v1/conversations/${encodeURIComponent(id)}`, { method: 'PATCH', json: patch });
  deleteConversation = (id: string) =>
    this.json<void>(`/v1/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });

  // Documents
  uploadDocument = (file: File | Blob, filename?: string) => {
    const form = new FormData();
    if (filename) form.append('file', file, filename);
    else form.append('file', file);
    return this.json<DocumentRecord>('/v1/documents', { method: 'POST', form });
  };
  listDocuments = () => this.json<{ items: DocumentRecord[] }>('/v1/documents');
  getDocument = (id: string) => this.json<DocumentRecord>(`/v1/documents/${encodeURIComponent(id)}`);
  deleteDocument = (id: string) => this.json<void>(`/v1/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });

  // Tools
  ocr = (image: File | Blob, mode: 'handwriting' | 'math' = 'handwriting') => {
    const form = new FormData();
    form.append('image', image);
    form.append('mode', mode);
    return this.json<{ text: string }>('/v1/ocr', { method: 'POST', form });
  };
  stt = (audio: Blob, filename = 'audio.webm') => {
    const form = new FormData();
    form.append('audio', audio, filename);
    return this.json<{ text: string }>('/v1/stt', { method: 'POST', form });
  };
  generateQuiz = (content: string) =>
    this.json<{ questions: QuizQuestion[] }>('/v1/generate/quiz', { method: 'POST', json: { content } });
  generateFlowchart = (content: string) =>
    this.json<{ mermaid: string }>('/v1/generate/flowchart', { method: 'POST', json: { content } });
  generateReport = (content: string) =>
    this.json<{ summary: string }>('/v1/generate/report', { method: 'POST', json: { content } });

  // Stats
  postQuizResult = (result: QuizResultInput) =>
    this.json<void>('/v1/quiz-results', { method: 'POST', json: result });
  getStats = () => this.json<Stats>('/v1/stats');
}

/** Shared app-wide instance (uses the Firebase user as token source). */
export const api = new ApiClient();
