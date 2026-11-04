/**
 * Maps API / unexpected errors to a user-facing, localised message.
 *
 * Transport-level problems and well-known HTTP statuses are translated; any other
 * server-provided message (e.g. a specific 422 reason) is shown as sent.
 */

import type { TFunction } from 'i18next';
import { ApiError } from './apiClient';

export function errorMessage(err: unknown, t: TFunction, fallbackKey = 'errors.generic'): string {
  if (!(err instanceof ApiError)) return t(fallbackKey);

  switch (err.code) {
    case 'network_error':
      return t('errors.network');
    case 'stream_interrupted':
      return t('errors.streamInterrupted');
    case 'bad_response':
    case 'no_stream':
      return t('errors.badResponse');
    default:
      break;
  }

  switch (err.status) {
    case 401:
      return t('errors.sessionExpired');
    case 404:
      return t('errors.notFound');
    case 413:
      return t('errors.tooLarge');
    case 429:
      return err.retryAfter ? t('errors.rateLimitedRetry', { seconds: err.retryAfter }) : t('errors.rateLimited');
    default:
      break;
  }
  if (err.status >= 500) return t('errors.server');
  return err.message || t(fallbackKey);
}
