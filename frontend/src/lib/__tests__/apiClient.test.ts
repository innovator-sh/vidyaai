import { describe, expect, test, vi } from 'vitest';
import { ApiClient, ApiError, parseSSE, type ChatEvent } from '../apiClient';

const BASE = 'https://api.example.test';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function sseResponse(chunks: string[], init: ResponseInit = {}): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' }, ...init });
}

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function makeClient(fetchImpl: ReturnType<typeof vi.fn>, getToken = vi.fn(async (force?: boolean) => (force ? 'fresh-token' : 'old-token'))) {
  const client = new ApiClient({ baseUrl: BASE, getToken, fetchImpl: fetchImpl as unknown as typeof fetch });
  return { client, getToken };
}

function callsOf(m: { mock: { calls: unknown[] } }): [string, RequestInit][] {
  return m.mock.calls as unknown as [string, RequestInit][];
}

async function collect(gen: AsyncGenerator<ChatEvent>): Promise<ChatEvent[]> {
  const out: ChatEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

describe('ApiClient requests', () => {
  test('attaches the Bearer token and parses JSON', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'u1', email: 'a@b.c' }));
    const { client } = makeClient(fetchMock);

    const me = await client.getMe();

    expect(me.id).toBe('u1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/v1/me`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer old-token');
  });

  test('on 401 refreshes the token and retries exactly once', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'unauthorized', message: 'expired' } }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ id: 'u1' }));
    const { client, getToken } = makeClient(fetchMock);

    const me = await client.getMe();

    expect(me.id).toBe('u1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenNthCalledWith(1, false);
    expect(getToken).toHaveBeenNthCalledWith(2, true);
    const retryInit = callsOf(fetchMock)[1][1];
    expect((retryInit.headers as Record<string, string>).Authorization).toBe('Bearer fresh-token');
  });

  test('does not retry more than once on persistent 401', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { code: 'unauthorized', message: 'nope' } }, { status: 401 }));
    const { client } = makeClient(fetchMock);

    await expect(client.getMe()).rejects.toMatchObject({ status: 401, code: 'unauthorized', message: 'nope' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('parses the error envelope and Retry-After on 429', async () => {
    const fetchMock = vi.fn(
      async () =>
        jsonResponse({ error: { code: 'rate_limited', message: 'Slow down' } }, { status: 429, headers: { 'Retry-After': '12', 'Content-Type': 'application/json' } }),
    );
    const { client } = makeClient(fetchMock);

    const err = await client.listDocuments().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, code: 'rate_limited', message: 'Slow down', retryAfter: 12 });
  });

  test('falls back to a friendly message for non-JSON errors and network failures', async () => {
    const { client } = makeClient(vi.fn(async () => new Response('<html>bad gateway</html>', { status: 502 })));
    await expect(client.getStats()).rejects.toMatchObject({ status: 502, code: 'http_error' });

    const down = makeClient(vi.fn(async () => { throw new TypeError('Failed to fetch'); })).client;
    await expect(down.getStats()).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });

  test('handles 204 responses', async () => {
    const { client } = makeClient(vi.fn(async () => new Response(null, { status: 204 })));
    await expect(client.deleteConversation('abc')).resolves.toBeUndefined();
  });

  test('uploads use multipart FormData without a manual Content-Type', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'd1', name: 'n.pdf', status: 'processing' }));
    const { client } = makeClient(fetchMock);

    await client.uploadDocument(new File(['x'], 'n.pdf', { type: 'application/pdf' }));

    const init = callsOf(fetchMock)[0][1];
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });
});

describe('parseSSE', () => {
  test('handles frames split across chunks, CRLF, comments and multi-line data', async () => {
    const body = sseResponse([
      ': keep-alive\r\n\r\nevent: token\r\ndata: {"te',
      'xt":"Hi"}\r\n\r\nevent: note\ndata: line1\ndata: line2\n\n',
    ]).body!;

    const frames = [];
    for await (const f of parseSSE(body)) frames.push(f);

    expect(frames).toEqual([
      { event: 'token', data: '{"text":"Hi"}' },
      { event: 'note', data: 'line1\nline2' },
    ]);
  });
});

describe('ApiClient.chat (SSE)', () => {
  test('streams meta, tokens and done in order', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        frame('meta', { conversation_id: 'c1', user_message_id: 'm1' }),
        frame('token', { text: 'Hel' }),
        frame('token', { text: 'lo' }),
        frame('done', { assistant_message_id: 'm2', title: 'Greeting' }),
      ]),
    );
    const { client } = makeClient(fetchMock);

    const events = await collect(client.chat({ message: 'hi', persona: 'teacher' }));

    expect(events).toEqual([
      { type: 'meta', conversation_id: 'c1', user_message_id: 'm1' },
      { type: 'token', text: 'Hel' },
      { type: 'token', text: 'lo' },
      { type: 'done', assistant_message_id: 'm2', title: 'Greeting' },
    ]);
    const init = callsOf(fetchMock)[0][1];
    expect((init.headers as Record<string, string>).Accept).toBe('text/event-stream');
  });

  test('generates a UUID message_id and reuses a caller supplied one (idempotent retry)', async () => {
    const fetchMock = vi.fn(async () => sseResponse([frame('done', { assistant_message_id: 'a', title: 't' })]));
    const { client } = makeClient(fetchMock);

    await collect(client.chat({ message: 'one' }));
    await collect(client.chat({ message: 'two', message_id: '11111111-1111-4111-8111-111111111111' }));
    await collect(client.chat({ message: 'two', message_id: '11111111-1111-4111-8111-111111111111' }));

    const ids = callsOf(fetchMock).map((c) => JSON.parse(c[1].body as string).message_id);
    expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(ids[1]).toBe('11111111-1111-4111-8111-111111111111');
    expect(ids[2]).toBe(ids[1]);
  });

  test('retries once with a fresh token when /v1/chat answers 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'unauthorized', message: 'expired' } }, { status: 401 }))
      .mockResolvedValueOnce(sseResponse([frame('done', { assistant_message_id: 'a', title: 't' })]));
    const { client, getToken } = makeClient(fetchMock);

    const events = await collect(client.chat({ message: 'hi' }));

    expect(events.at(-1)).toMatchObject({ type: 'done' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenLastCalledWith(true);
    const sent = callsOf(fetchMock).map((c) => JSON.parse(c[1].body as string).message_id);
    expect(sent[0]).toBe(sent[1]); // same idempotency key across the retry
  });

  test('throws ApiError for an in-stream error event', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([frame('meta', { conversation_id: 'c', user_message_id: 'u' }), frame('error', { code: 'llm_timeout', message: 'Model timed out' })]),
    );
    const { client } = makeClient(fetchMock);

    const seen: ChatEvent[] = [];
    const run = async () => {
      for await (const ev of client.chat({ message: 'hi' })) seen.push(ev);
    };

    await expect(run()).rejects.toMatchObject({ code: 'llm_timeout', message: 'Model timed out' });
    expect(seen).toHaveLength(1);
  });

  test('throws when the stream ends without a done event', async () => {
    const fetchMock = vi.fn(async () => sseResponse([frame('token', { text: 'partial' })]));
    const { client } = makeClient(fetchMock);

    await expect(collect(client.chat({ message: 'hi' }))).rejects.toMatchObject({ code: 'stream_interrupted' });
  });

  test('maps HTTP errors before the stream starts (429 with Retry-After)', async () => {
    const fetchMock = vi.fn(
      async () => jsonResponse({ error: { code: 'rate_limited', message: 'Too many' } }, { status: 429, headers: { 'Retry-After': '30', 'Content-Type': 'application/json' } }),
    );
    const { client } = makeClient(fetchMock);

    await expect(collect(client.chat({ message: 'hi' }))).rejects.toMatchObject({ status: 429, retryAfter: 30 });
  });

  test('propagates aborts', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return sseResponse([frame('done', { assistant_message_id: 'a', title: 't' })]);
    });
    const { client } = makeClient(fetchMock);

    controller.abort();
    await expect(collect(client.chat({ message: 'hi' }, controller.signal))).rejects.toMatchObject({ name: 'AbortError' });
  });
});
