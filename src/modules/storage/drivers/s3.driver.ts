import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import * as path from 'path';
import {
  StorageDriver,
  StorageFile,
  StoredObject,
  UploadOptions,
} from '../storage.types';

/**
 * S3-compatible object storage for production.
 *
 * Written against the S3 API rather than AWS specifically: setting
 * `S3_ENDPOINT` points this at Cloudflare R2, MinIO, DigitalOcean Spaces or
 * any other compatible host. `forcePathStyle` follows automatically, because
 * most non-AWS providers do not support virtual-host-style bucket addressing.
 *
 * Objects are uploaded private. Access goes through `getUrl`, which issues a
 * time-limited presigned URL — a public-read bucket would make every document
 * URL permanently valid to anyone who ever saw it.
 */
@Injectable()
export class S3StorageDriver implements StorageDriver {
  readonly name = 's3' as const;

  private readonly logger = new Logger(S3StorageDriver.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly defaultUrlTtlSeconds = 900; // 15 minutes

  constructor(private readonly config: ConfigService) {
    /* getOrThrow is safe here: the environment schema already refuses to boot
     * with STORAGE_DRIVER=s3 unless this whole block is present. */
    const endpoint = this.config.get<string>('S3_ENDPOINT');

    this.bucket = this.config.getOrThrow<string>('S3_BUCKET');
    this.client = new S3Client({
      region: this.config.getOrThrow<string>('S3_REGION'),
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
  }

  async upload(file: StorageFile, options: UploadOptions = {}): Promise<StoredObject> {
    const folder = sanitiseFolder(options.folder ?? 'misc');
    const filename = options.preserveFilename
      ? sanitiseFilename(file.originalname)
      : generateFilename(file.originalname);

    const key = `${folder}/${filename}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        /* Retained so a download can restore the user's original filename
         * even though the stored key is a UUID. */
        Metadata: { originalName: encodeURIComponent(file.originalname) },
      }),
    );

    this.logger.debug(`Stored s3://${this.bucket}/${key}`);

    return {
      key,
      url: await this.getUrl(key),
      size: file.buffer.length,
      mimetype: file.mimetype,
      originalName: file.originalname,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );

      if (!response.Body) {
        throw new NotFoundException(`Stored object not found: ${key}`);
      }

      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException(`Stored object not found: ${key}`);
    }
  }

  async getUrl(key: string, expiresInSeconds?: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds ?? this.defaultUrlTtlSeconds },
    );
  }
}

function sanitiseFolder(folder: string): string {
  return (
    folder
      .split('/')
      .map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, ''))
      .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
      .join('/') || 'misc'
  );
}

function sanitiseFilename(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
}

function generateFilename(originalName: string): string {
  const ext = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
  return `${randomUUID()}${ext}`;
}
