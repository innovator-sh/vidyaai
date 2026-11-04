import { describe, expect, test } from 'vitest';
import { MAX_URL_LENGTH, urlErrorKey, validateDocumentUrl } from '../url';

describe('validateDocumentUrl', () => {
  test.each([
    ['https://example.com', 'https://example.com/'],
    ['  http://example.com/a/b.pdf?x=1#frag  ', 'http://example.com/a/b.pdf?x=1#frag'],
    ['HTTPS://Example.COM/Path', 'https://example.com/Path'],
    ['http://localhost:8080/x', 'http://localhost:8080/x'],
  ])('accepts %s', (input, normalized) => {
    expect(validateDocumentUrl(input)).toEqual({ ok: true, url: normalized });
  });

  test('rejects empty input', () => {
    expect(validateDocumentUrl('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  test.each(['ftp://example.com/file', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hi', 'mailto:a@b.c'])(
    'rejects non-http(s) scheme %s',
    (input) => {
      expect(validateDocumentUrl(input)).toEqual({ ok: false, reason: 'protocol' });
    },
  );

  test.each(['example.com', 'not a url', 'http://', 'https://user:pw@example.com/'])('rejects malformed or credentialed %s', (input) => {
    expect(validateDocumentUrl(input)).toEqual({ ok: false, reason: 'invalid' });
  });

  test('rejects overly long URLs', () => {
    const long = `https://example.com/${'a'.repeat(MAX_URL_LENGTH)}`;
    expect(validateDocumentUrl(long)).toEqual({ ok: false, reason: 'too_long' });
  });

  test('maps reasons to translation keys', () => {
    expect(urlErrorKey('empty')).toBe('kb.urlRequired');
    expect(urlErrorKey('protocol')).toBe('kb.urlProtocol');
    expect(urlErrorKey('too_long')).toBe('kb.urlTooLong');
    expect(urlErrorKey('invalid')).toBe('kb.urlInvalid');
  });
});
