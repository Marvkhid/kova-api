// ============================================================
// KOVA API — Uploads Module
// Cloudinary image upload for products and profiles.
// ============================================================

import {
  Injectable,
  Module,
  BadRequestException,
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { FileFilterCallback, memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';

// ── Service ───────────────────────────────────────────────

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  /** Flips off permanently after the first Cloudinary failure → local disk. */
  private cloudinaryEnabled = true;
  /** Local fallback dir — inside the FRONTEND's public folder so uploaded
   *  images are served by Next.js exactly like the seed images
   *  (/images/uploads/<file>). Works because both apps run from this repo. */
  private readonly localDir = join(process.cwd(), '..', 'kova', 'public', 'images', 'uploads');

  constructor(private config: ConfigService) {
    // Configure Cloudinary
    cloudinary.config({
      cloud_name: this.config.get('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.get('CLOUDINARY_API_KEY'),
      api_secret: this.config.get('CLOUDINARY_API_SECRET'),
    });
    mkdirSync(this.localDir, { recursive: true });
  }

  /** Cloudinary when its keys are valid; transparent local-disk fallback
   *  otherwise (e.g. invalid/expired demo credentials). URLs stay relative
   *  so they render in the frontend without an absolute origin. */
  async uploadImage(
    file: Express.Multer.File,
    folder: string = 'kova/products',
  ): Promise<string> {
    if (this.cloudinaryEnabled) {
      try {
        return await this.cloudinaryUpload(file, folder);
      } catch (err) {
        this.cloudinaryEnabled = false;
        this.logger.warn(
          `Cloudinary upload failed (${(err as Error).message ?? err}) — using local disk fallback. Fix CLOUDINARY_* credentials in .env to restore cloud uploads.`,
        );
      }
    }
    return this.localUpload(file);
  }

  private cloudinaryUpload(
    file: Express.Multer.File,
    folder: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder,
            resource_type: 'image',
            transformation: [
              { width: 1200, height: 1200, crop: 'limit' },
              { quality: 'auto', fetch_format: 'auto' },
            ],
          },
          (error, result: UploadApiResponse | undefined) => {
            if (error) reject(error);
            else resolve(result!.secure_url);
          },
        )
        .end(file.buffer);
    });
  }

  private localUpload(file: Express.Multer.File): string {
    const ext = (file.mimetype?.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
    const name = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
    writeFileSync(join(this.localDir, name), file.buffer);
    return `/images/uploads/${name}`;
  }

  async uploadMultiple(
    files: Express.Multer.File[],
    folder: string = 'kova/products',
  ): Promise<string[]> {
    return Promise.all(files.map((f) => this.uploadImage(f, folder)));
  }

  async uploadAvatar(file: Express.Multer.File): Promise<string> {
    return this.uploadImage(file, 'kova/avatars');
  }
}

// ── Multer config (memory storage) ───────────────────────

const multerConfig: MulterOptions = {
  storage: memoryStorage(), // memory storage — buffer used for Cloudinary
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (
    _req,
    file: Parameters<NonNullable<MulterOptions['fileFilter']>>[1],
    cb: FileFilterCallback,
  ) => {
    if (!file.mimetype?.startsWith('image/')) {
      return cb(new BadRequestException('Only image files are allowed'));
    }
    cb(null, true);
  },
};

// ── Controller ────────────────────────────────────────────

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private uploads: UploadsService) {}

  // POST /api/uploads/image — upload single product image
  @Post('image')
  @UseInterceptors(FileInterceptor('file', multerConfig))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    const url = await this.uploads.uploadImage(file, 'kova/products');
    return { url };
  }

  // POST /api/uploads/images — upload multiple product images
  @Post('images')
  @UseInterceptors(FilesInterceptor('files', 5, multerConfig))
  async uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0)
      throw new BadRequestException('No files provided');
    const urls = await this.uploads.uploadMultiple(files, 'kova/products');
    return { urls };
  }

  // POST /api/uploads/avatar — upload profile photo
  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', multerConfig))
  async uploadAvatar(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    const url = await this.uploads.uploadAvatar(file);
    return { url };
  }
}

// ── Module ────────────────────────────────────────────────

@Module({
  providers: [UploadsService],
  controllers: [UploadsController],
  exports: [UploadsService],
})
export class UploadsModule {}