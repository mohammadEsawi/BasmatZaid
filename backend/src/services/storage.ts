import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { ApiError } from '../utils/http.js';

export const UPLOAD_FOLDERS = ['products', 'categories', 'settings'] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

export interface StorageProvider {
  save(buffer: Buffer, folder: UploadFolder, filename: string): Promise<string>;
}

export const uploadRoot = path.resolve(env.UPLOAD_DIR);

/** Stores files on the server disk; served by Express at /uploads. Returns a relative URL. */
class LocalStorage implements StorageProvider {
  async save(buffer: Buffer, folder: UploadFolder, filename: string) {
    const dir = path.join(uploadRoot, folder);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), buffer);
    return `/uploads/${folder}/${filename}`;
  }
}

class CloudinaryStorage implements StorageProvider {
  constructor() {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  save(buffer: Buffer, folder: UploadFolder, filename: string) {
    return new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `${env.CLOUDINARY_FOLDER}/${folder}`, public_id: filename.replace(/\.webp$/, ''), resource_type: 'image' },
        (error, result) => (error || !result ? reject(error ?? new Error('Upload failed')) : resolve(result.secure_url)),
      );
      stream.end(buffer);
    });
  }
}

export const storage: StorageProvider = env.STORAGE_PROVIDER === 'cloudinary' ? new CloudinaryStorage() : new LocalStorage();

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif']);

/**
 * Validates that the upload really is an image (by decoding it, not trusting the
 * extension or MIME type), strips metadata, and re-encodes it as WebP.
 */
export async function processAndStoreImage(buffer: Buffer, folder: UploadFolder): Promise<string> {
  let output: Buffer;
  try {
    const image = sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 });
    const meta = await image.metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new Error('unsupported');
    output = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch {
    throw ApiError.badRequest('الملف ليس صورة صالحة. الصيغ المسموحة: JPG, PNG, WEBP');
  }

  try {
    return await storage.save(output, folder, `${randomUUID()}.webp`);
  } catch (error) {
    console.error('[storage] failed to save image:', error instanceof Error ? error.message : error);
    throw new ApiError(502, 'تعذر حفظ الصورة، يرجى المحاولة مرة أخرى');
  }
}
