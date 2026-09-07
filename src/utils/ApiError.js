export class ApiError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
    this.expose = true;
  }
  static badRequest(msg = 'Bad request', details) { return new ApiError(400, msg, details); }
  // All of these take details, not just badRequest: a caller that wants to
  // give the client something to branch on should not have its second
  // argument silently dropped.
  static unauthorized(msg = 'Unauthorized', details) { return new ApiError(401, msg, details); }
  static forbidden(msg = 'Forbidden', details) { return new ApiError(403, msg, details); }
  static notFound(msg = 'Not found', details) { return new ApiError(404, msg, details); }
  static conflict(msg = 'Conflict', details) { return new ApiError(409, msg, details); }
}
