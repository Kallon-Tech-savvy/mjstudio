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
