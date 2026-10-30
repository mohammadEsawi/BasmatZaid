import type { Response } from 'express';

export interface FieldError {
  path: string;
  message: string;
}

/** An error that is safe to show to the client, with an Arabic message. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors: FieldError[] = [],
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, errors: FieldError[] = [], code?: string) {
    return new ApiError(400, message, errors, code);
  }
  static unauthorized(message = 'يجب تسجيل الدخول أولاً') {
    return new ApiError(401, message, [], 'UNAUTHORIZED');
  }
  static forbidden(message = 'ليس لديك صلاحية لتنفيذ هذه العملية') {
    return new ApiError(403, message, [], 'FORBIDDEN');
  }
  static notFound(message = 'العنصر المطلوب غير موجود') {
    return new ApiError(404, message, [], 'NOT_FOUND');
  }
  static conflict(message: string, code?: string) {
    return new ApiError(409, message, [], code);
  }
}

export function ok<T>(res: Response, data: T, message = 'تم تنفيذ العملية بنجاح', status = 200) {
  return res.status(status).json({ success: true, data, message });
}

export function created<T>(res: Response, data: T, message = 'تمت الإضافة بنجاح') {
  return ok(res, data, message, 201);
}
