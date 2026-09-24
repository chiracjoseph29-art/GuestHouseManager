export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = "INTERNAL_ERROR",
    public readonly exposeMessage = false,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthError extends AppError {
  constructor(message = "Authentication required.") {
    super(message, 401, "UNAUTHORIZED", true);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, 403, "FORBIDDEN", true);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid request.") {
    super(message, 400, "VALIDATION_ERROR", true);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found.") {
    super(message, 404, "NOT_FOUND", true);
  }
}

export class ConflictError extends AppError {
  constructor(
    message = "Unable to complete this request due to a conflict.",
    details?: Record<string, unknown>,
  ) {
    super(message, 409, "CONFLICT", true, details);
  }
}
