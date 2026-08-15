import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  StorageDriver,
  StorageFile,
  StoredObject,
  UploadOptions,
} from '../storage.types';

/**
 * Filesystem-backed storage for development.
 *
 * Keys are POSIX-style relative paths (`documents/uuid-name.pdf`) so they read
 * the same here as they will in an object store, and only get translated to a
 * real filesystem path at the last moment.
 */
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local' as const;

  private readonly logger = new Logger(LocalStorageDriver.name);
  private readonly root: string;
  private readonly publicPrefix = '/uploads';

  constructor(private readonly config: ConfigService) {
    this.root = path.resolve(
      this.config.get<string>('STORAGE_LOCAL_PATH', './uploads'),
    );
  }

  async upload(file: StorageFile, options: UploadOptions = {}): Promise<StoredObject> {
    const folder = sanitiseFolder(options.folder ?? 'misc');
    const filename = options.preserveFilename
      ? sanitiseFilename(file.originalname)
      : generateFilename(file.originalname);

    const key = `${folder}/${filename}`;
    const absolute = this.toAbsolute(key);

    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, file.buffer);

    this.logger.debug(`Stored ${key} (${file.buffer.length} bytes)`);

    return {
      key,
      url: `${this.publicPrefix}/${key}`,
      size: file.buffer.length,
      mimetype: file.mimetype,
      originalName: file.originalname,
    };
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.toAbsolute(key));
    } catch (error) {
      /* Deleting something already gone is the desired end state, so this is
       * idempotent rather than an error. */
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.toAbsolute(key));
      return true;
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.toAbsolute(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException(`Stored object not found: ${key}`);
      }
      throw error;
    }
  }

  async getUrl(key: string): Promise<string> {
    /* No signing locally — the file is served statically. The parameter exists
     * to satisfy the interface that S3 needs. */
    return `${this.publicPrefix}/${key}`;
  }

  /**
   * Resolve a key to an absolute path, refusing anything that escapes the
   * storage root.
   *
   * Without this check a key of `../../etc/passwd` would read or overwrite
   * arbitrary files. Resolve first, then verify containment — string
   * inspection alone misses symlinks and encoded traversals.
   */
  private toAbsolute(key: string): string {
    const resolved = path.resolve(this.root, key);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;

    if (resolved !== this.root && !resolved.startsWith(rootWithSep)) {
      throw new Error(`Invalid storage key (path traversal): ${key}`);
    }

    return resolved;
  }
}

/** Strip anything that is not a safe path segment. */
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

/** UUID prefix keeps concurrent uploads of the same name from colliding. */
function generateFilename(originalName: string): string {
  const ext = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 12);
  return `${randomUUID()}${ext}`;
}
