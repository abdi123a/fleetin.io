import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  STORAGE_DRIVER,
  StorageDriver,
  StorageFile,
  StoredObject,
  UploadOptions,
} from './storage.types';

/**
 * The only storage entry point business code may use.
 *
 * Every method delegates to whichever driver was selected at boot. Feature
 * modules inject *this*, never a driver and never `fs` — that indirection is
 * what lets development run on the filesystem while production runs on S3
 * with no call-site changes.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    @Inject(STORAGE_DRIVER) private readonly driver: StorageDriver,
  ) {
    this.logger.log(`Storage driver: ${this.driver.name}`);
  }

  /** Which backend is active. Useful in health output and tests. */
  get driverName(): 'local' | 's3' {
    return this.driver.name;
  }

  /**
   * Store a file and return its key, URL and metadata.
   *
   * Persist the returned `key` — it is the stable identifier. Do not persist
   * `url`: on S3 that is a presigned URL which expires, so a stored copy would
   * become a dead link.
   */
  async upload(file: StorageFile, options?: UploadOptions): Promise<StoredObject> {
    return this.driver.upload(file, options);
  }

  /** Upload several files, preserving input order. */
  async uploadMany(
    files: StorageFile[],
    options?: UploadOptions,
  ): Promise<StoredObject[]> {
    return Promise.all(files.map((file) => this.driver.upload(file, options)));
  }

  /** Remove an object. Succeeds whether or not the key existed. */
  async delete(key: string): Promise<void> {
    return this.driver.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.driver.exists(key);
  }

  /** Read an object's bytes. Throws NotFoundException for a missing key. */
  async get(key: string): Promise<Buffer> {
    return this.driver.get(key);
  }

  /**
   * A URL for the object. On S3 this is presigned and expires; locally it is a
   * static path and `expiresInSeconds` is ignored.
   */
  async getUrl(key: string, expiresInSeconds?: number): Promise<string> {
    return this.driver.getUrl(key, expiresInSeconds);
  }
}
