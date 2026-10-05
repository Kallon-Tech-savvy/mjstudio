export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(code: string, message: string, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class BadRequestError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.', code = 'AUTHENTICATION_REQUIRED') {
    super(code, message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden.') {
    super('FORBIDDEN', message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 409);
  }
}

export class ValidationError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 422);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests.') {
    super('RATE_LIMITED', message, 429);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'This service is not configured.') {
    super('SERVICE_UNAVAILABLE', message, 503);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = 'Content-Type must be application/json.') {
    super('UNSUPPORTED_MEDIA_TYPE', message, 415);
  }
}

export class NotFoundError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 404);
  }
}

export class DatabaseUnavailableError extends AppError {
  constructor(message = 'The service is temporarily unavailable. Please try again shortly.') {
    super('DATABASE_UNAVAILABLE', message, 503);
  }
}

const DB_CONNECTION_CODES = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN',
  '28P01', '28000', '3D000', '53300', '57P01', '57P02', '57P03',
]);

export function isDatabaseConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string' && (DB_CONNECTION_CODES.has(code) || code.startsWith('08'))) return true;
  const nested = (err as { errors?: unknown }).errors;
  if (Array.isArray(nested) && nested.some((cause) => isDatabaseConnectionError(cause))) return true;
  return /timeout exceeded when trying to connect|Connection terminated|Connection refused/i.test(err.message);
}
