/** Client-side validation for "Add from URL". The server re-validates (SSRF etc.); this is UX only. */

export const MAX_URL_LENGTH = 2048;

export type UrlCheck =
  | { ok: true; url: string }
  | { ok: false; reason: 'empty' | 'invalid' | 'protocol' | 'too_long' };

export function validateDocumentUrl(raw: string): UrlCheck {
  const value = raw.trim();
  if (!value) return { ok: false, reason: 'empty' };
  if (value.length > MAX_URL_LENGTH) return { ok: false, reason: 'too_long' };

  // A scheme-less "example.com/x" is rejected rather than guessed, but a bare "javascript:..." must
  // be reported as a protocol problem, so check for an explicit scheme first.
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(value);
  if (scheme && !/^https?$/i.test(scheme[1]) && !/^[^/]*:\d+(\/|$)/.test(value)) {
    return { ok: false, reason: 'protocol' };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, reason: 'protocol' };
  if (!parsed.hostname || parsed.username || parsed.password) return { ok: false, reason: 'invalid' };
  return { ok: true, url: parsed.toString() };
}

/** Translation key for a failed check. */
export function urlErrorKey(reason: Exclude<UrlCheck, { ok: true }>['reason']): string {
  switch (reason) {
    case 'empty':
      return 'kb.urlRequired';
    case 'protocol':
      return 'kb.urlProtocol';
    case 'too_long':
      return 'kb.urlTooLong';
    default:
      return 'kb.urlInvalid';
  }
}
