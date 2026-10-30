import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { requireRole } from '../../middleware/auth.js';
import { ApiError, created } from '../../utils/http.js';
import { processAndStoreImage, UPLOAD_FOLDERS } from '../../services/storage.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(ApiError.badRequest('نوع الملف غير مدعوم. الصيغ المسموحة: JPG, PNG, WEBP'));
  },
});

const folderSchema = z.object({ folder: z.enum(UPLOAD_FOLDERS).default('products') });

export const uploadsRouter = Router();

uploadsRouter.post('/', requireRole('ADMIN'), upload.single('file'), async (req, res) => {
  if (!req.file) throw ApiError.badRequest('يرجى اختيار صورة');
  const { folder } = folderSchema.parse(req.body ?? {});
  const url = await processAndStoreImage(req.file.buffer, folder);
  created(res, { url }, 'تم رفع الصورة بنجاح');
});
