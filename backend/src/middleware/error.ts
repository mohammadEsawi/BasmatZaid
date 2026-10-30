import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { ZodError } from 'zod';
import { ApiError } from '../utils/http.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, message: 'المسار المطلوب غير موجود', errors: [] });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ success: false, message: err.message, code: err.code, errors: err.errors });
  }

  if (err instanceof ZodError) {
    const errors = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return res.status(400).json({ success: false, message: errors[0]?.message ?? 'البيانات المدخلة غير صحيحة', code: 'VALIDATION_ERROR', errors });
  }

  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'حجم الصورة أكبر من المسموح' : 'تعذر رفع الملف';
    return res.status(400).json({ success: false, message, code: 'UPLOAD_ERROR', errors: [] });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ');
      return res.status(409).json({ success: false, message: 'هذه القيمة مستخدمة مسبقاً', code: 'DUPLICATE', errors: target ? [{ path: target, message: 'مستخدم مسبقاً' }] : [] });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'العنصر المطلوب غير موجود', code: 'NOT_FOUND', errors: [] });
    }
    if (err.code === 'P2003') {
      return res.status(409).json({ success: false, message: 'لا يمكن تنفيذ العملية لارتباط العنصر ببيانات أخرى', code: 'FOREIGN_KEY', errors: [] });
    }
  }

  // body-parser errors
  const type = (err as { type?: string }).type;
  if (type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'حجم الطلب أكبر من المسموح', errors: [] });
  }
  if (type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'صيغة البيانات المرسلة غير صحيحة', errors: [] });
  }

  // Log only the error itself — never request bodies, cookies or customer data.
  console.error(`[error] ${req.method} ${req.path}:`, err instanceof Error ? err.stack ?? err.message : err);
  return res.status(500).json({ success: false, message: 'حدث خطأ غير متوقع، يرجى المحاولة لاحقاً', errors: [] });
};
