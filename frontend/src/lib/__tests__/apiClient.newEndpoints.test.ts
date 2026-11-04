import { describe, expect, test, vi } from 'vitest';
import { ApiClient, ApiError, type Stats } from '../apiClient';

const BASE = 'https://api.example.test';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function makeClient(fetchImpl: ReturnType<typeof vi.fn>) {
  return new ApiClient({
    baseUrl: BASE,
    getToken: async () => 'tok',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
}

function lastCall(m: ReturnType<typeof vi.fn>): [string, RequestInit] {
  return m.mock.calls.at(-1) as unknown as [string, RequestInit];
}

describe('ApiClient.createDocumentFromUrl', () => {
  test('POSTs {url} as JSON to /v1/documents/from-url and returns the processing record', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'd1', name: 'example.com', status: 'processing' }, { status: 202 }));
    const doc = await makeClient(fetchMock).createDocumentFromUrl('https://example.com/paper.pdf');

    expect(doc).toEqual({ id: 'd1', name: 'example.com', status: 'processing' });
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe(`${BASE}/v1/documents/from-url`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://example.com/paper.pdf' });
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Authorization).toBe('Bearer tok');
  });

  test('surfaces server validation errors as ApiError', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { code: 'invalid_url', message: 'URL is not allowed' } }, { status: 422 }),
    );
    const err = await makeClient(fetchMock)
      .createDocumentFromUrl('http://169.254.169.254/')
      .catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBe('invalid_url');
    expect(err.message).toBe('URL is not allowed');
  });

  test('429 carries Retry-After', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { code: 'rate_limited', message: 'slow down' } }, { status: 429, headers: { 'Retry-After': '12' } }),
    );
    const err = await makeClient(fetchMock)
      .createDocumentFromUrl('https://example.com')
      .catch((e) => e);
    expect(err.retryAfter).toBe(12);
  });
});

describe('ApiClient.getStats', () => {
  test('returns the extended stats fields untouched', async () => {
    const payload: Stats = {
      quiz_results: [],
      chat_count: 3,
      streak_days: 2,
      by_subject: [{ subject: 'Physics', count: 2 }],
      weekly_activity: [{ date: '2026-11-03', messages: 5 }],
      quiz_accuracy: 0.75,
      study_minutes_by_subject: [{ subject: 'Physics', minutes: 40 }],
    };
    const fetchMock = vi.fn(async () => jsonResponse(payload));
    expect(await makeClient(fetchMock).getStats()).toEqual(payload);
    expect(lastCall(fetchMock)[0]).toBe(`${BASE}/v1/stats`);
  });

  test('still works against an older backend without the new fields', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ quiz_results: [], chat_count: 0, streak_days: 0 }));
    const stats = await makeClient(fetchMock).getStats();
    expect(stats.by_subject).toBeUndefined();
    expect(stats.quiz_accuracy).toBeUndefined();
  });
});

describe('ApiClient.chat language', () => {
  test('sends the language and document_id in the request body', async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('event: done\ndata: {"assistant_message_id":"a","title":"t"}\n\n'));
        c.close();
      },
    });
    const fetchMock = vi.fn(async () => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
    const client = makeClient(fetchMock);

    for await (const ev of client.chat({ message: 'namaste', language: 'hi', document_id: 'doc-1' })) void ev;

    const sent = JSON.parse(lastCall(fetchMock)[1].body as string);
    expect(sent.language).toBe('hi');
    expect(sent.document_id).toBe('doc-1');
    expect(typeof sent.message_id).toBe('string');
  });
});
