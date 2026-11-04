import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import i18n from '@/i18n';
import { ApiError } from '../apiClient';
import { errorMessage } from '../errors';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('errorMessage', () => {
  test('translates transport and well-known status errors', () => {
    expect(errorMessage(new ApiError(0, 'network_error', 'x'), i18n.t)).toMatch(/reach the server/i);
    expect(errorMessage(new ApiError(401, 'unauthorized', 'x'), i18n.t)).toMatch(/session has expired/i);
    expect(errorMessage(new ApiError(404, 'not_found', 'x'), i18n.t)).toMatch(/could not be found/i);
    expect(errorMessage(new ApiError(503, 'unavailable', 'x'), i18n.t)).toMatch(/server had a problem/i);
  });

  test('429 mentions the retry delay when provided', () => {
    expect(errorMessage(new ApiError(429, 'rate_limited', 'x', 7), i18n.t)).toContain('7s');
    expect(errorMessage(new ApiError(429, 'rate_limited', 'x'), i18n.t)).not.toContain('{{');
  });

  test('keeps specific server messages for other statuses', () => {
    expect(errorMessage(new ApiError(422, 'invalid_url', 'URL is not allowed'), i18n.t)).toBe('URL is not allowed');
  });

  test('falls back for unknown errors, in the active language', async () => {
    expect(errorMessage(new Error('boom'), i18n.t)).toBe('Something went wrong. Please try again.');
    await i18n.changeLanguage('hi');
    expect(errorMessage(new Error('boom'), i18n.t)).toBe('कुछ गलत हो गया। कृपया पुनः प्रयास करें।');
    expect(errorMessage(new ApiError(404, 'not_found', 'x'), i18n.t)).toBe('वह आइटम नहीं मिला।');
  });
});
