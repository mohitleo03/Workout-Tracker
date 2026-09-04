import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = err.status || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  }
  if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for "${err.path}"`;
  }
  if (err.code === 11000) {
    status = 409;
    message = 'Duplicate value';
    details = err.keyValue;
  }

  if (status >= 500) console.error('[error]', err);

  res.status(status).json({
    success: false,
    error: { message, ...(details ? { details } : {}) },
    ...(env.isProd ? {} : { stack: status >= 500 ? err.stack : undefined }),
  });
}
