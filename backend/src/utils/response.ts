import type { ApiCollectionEnvelope, ApiEnvelope, ApiErrorEnvelope } from '../types/http.js';

export function successEnvelope<T>(data: T): ApiEnvelope<T> {
  return { data };
}

export function collectionEnvelope<T>(data: T[]): ApiCollectionEnvelope<T> {
  return {
    data,
    meta: { count: data.length },
  };
}

export function errorEnvelope(code: string, message: string, requestId: string): ApiErrorEnvelope {
  return {
    error: {
      code,
      message,
      request_id: requestId,
    },
  };
}
