/** Helpers for documents that are processed asynchronously on the server. */

import type { DocumentRecord } from './apiClient';

export class PollTimeoutError extends Error {
  constructor() {
    super('Timed out waiting for the document to finish processing.');
    this.name = 'PollTimeoutError';
  }
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onUpdate?: (doc: DocumentRecord) => void;
  /** Injectable for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Polls `getDocument` until the status is `ready` or `failed` and returns that record.
 * Throws PollTimeoutError after `timeoutMs` and an AbortError when `signal` aborts.
 * Transient fetch errors are tolerated (retried) until the timeout.
 */
export async function pollDocument(
  getDocument: (id: string) => Promise<DocumentRecord>,
  id: string,
  opts: PollOptions = {},
): Promise<DocumentRecord> {
  const { intervalMs = 2000, timeoutMs = 180_000, signal, onUpdate } = opts;
  const sleep = opts.sleep ?? defaultSleep;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const doc = await getDocument(id);
      onUpdate?.(doc);
      if (doc.status === 'ready' || doc.status === 'failed') return doc;
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      // 404 means the document is gone; anything else may be a blip.
      if ((err as { status?: number })?.status === 404) throw err;
    }
    if (Date.now() + intervalMs > deadline) throw new PollTimeoutError();
    await sleep(intervalMs, signal);
  }
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
