import { describe, expect, test, vi } from 'vitest';
import type { DocumentRecord } from '../apiClient';
import { PollTimeoutError, pollDocument } from '../documents';

const doc = (status: DocumentRecord['status']): DocumentRecord => ({ id: 'd1', name: 'n.pdf', status });
const noSleep = async () => {};

describe('pollDocument', () => {
  test('polls until the document is ready and reports each update', async () => {
    const get = vi
      .fn<(id: string) => Promise<DocumentRecord>>()
      .mockResolvedValueOnce(doc('processing'))
      .mockResolvedValueOnce(doc('processing'))
      .mockResolvedValueOnce(doc('ready'));
    const seen: string[] = [];

    const result = await pollDocument(get, 'd1', { sleep: noSleep, onUpdate: (d) => seen.push(d.status) });

    expect(result.status).toBe('ready');
    expect(get).toHaveBeenCalledTimes(3);
    expect(seen).toEqual(['processing', 'processing', 'ready']);
  });

  test('returns a failed document instead of throwing', async () => {
    const get = vi.fn(async () => doc('failed'));
    expect((await pollDocument(get, 'd1', { sleep: noSleep })).status).toBe('failed');
  });

  test('tolerates transient errors but gives up on 404', async () => {
    const get = vi
      .fn<(id: string) => Promise<DocumentRecord>>()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce(doc('ready'));
    expect((await pollDocument(get, 'd1', { sleep: noSleep })).status).toBe('ready');

    const gone = vi.fn(async (): Promise<DocumentRecord> => {
      throw Object.assign(new Error('nope'), { status: 404 });
    });
    await expect(pollDocument(gone, 'd1', { sleep: noSleep })).rejects.toMatchObject({ status: 404 });
  });

  test('times out with PollTimeoutError', async () => {
    const get = vi.fn(async () => doc('processing'));
    await expect(
      pollDocument(get, 'd1', { intervalMs: 50, timeoutMs: 120, sleep: () => new Promise((r) => setTimeout(r, 60)) }),
    ).rejects.toBeInstanceOf(PollTimeoutError);
  });

  test('stops with AbortError when the signal aborts', async () => {
    const controller = new AbortController();
    const get = vi.fn(async () => {
      controller.abort();
      return doc('processing');
    });
    await expect(pollDocument(get, 'd1', { signal: controller.signal, sleep: noSleep })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
