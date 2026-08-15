/**
 * The storage contract.
 *
 * Business modules depend on `StorageService` — never on `fs`, never on an S3
 * SDK. That is the whole point of this file: the day production moves to S3,
 * nothing outside this folder changes.
 */

/** A file handed to the storage layer, matching Multer's in-memory shape. */
export interface StorageFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size?: number;
}

/** Where a stored object lives, and what it is. */
export interface StoredObject {
  /** Driver-relative key, e.g. `documents/2026/08/abc123-invoice.pdf`. */
  key: string;
  /** URL or path a client can use to fetch it. */
  url: string;
  size: number;
  mimetype: string;
  originalName: string;
}

export interface UploadOptions {
  /** Logical folder, e.g. `documents` or `avatars`. Defaults to `misc`. */
  folder?: string;
  /**
   * Keep the caller's filename instead of generating one. Off by default:
   * generated names avoid collisions and stop user input reaching the
   * filesystem.
   */
  preserveFilename?: boolean;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

/**
 * What every driver must implement.
 *
 * Deliberately small. Anything a specific backend can do but the others
 * cannot — S3 multipart, presigned PUTs — stays out, or it is not really an
 * abstraction.
 */
export interface StorageDriver {
  readonly name: 'local' | 's3';

  upload(file: StorageFile, options?: UploadOptions): Promise<StoredObject>;

  delete(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;

  /** Read an object back. Throws if the key does not exist. */
  get(key: string): Promise<Buffer>;

  /**
   * A URL for the object, valid for `expiresInSeconds` where the driver
   * supports expiry. The local driver returns a plain static path and ignores
   * the argument.
   */
  getUrl(key: string, expiresInSeconds?: number): Promise<string>;
}
