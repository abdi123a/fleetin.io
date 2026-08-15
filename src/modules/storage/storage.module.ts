import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { STORAGE_DRIVER, StorageDriver } from './storage.types';
import { LocalStorageDriver } from './drivers/local.driver';
import { S3StorageDriver } from './drivers/s3.driver';

/**
 * Binds the `STORAGE_DRIVER` token to a concrete driver, once, at boot.
 *
 * Choosing here rather than inside `StorageService` means the decision is made
 * a single time from validated config, instead of being re-evaluated per call
 * — and an unsupported driver name fails at startup rather than on a user's
 * first upload.
 *
 * `@Global` so feature modules can inject `StorageService` without importing
 * this module explicitly.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageDriver => {
        const driver = config.get<string>('STORAGE_DRIVER', 'local');

        switch (driver) {
          case 's3':
            return new S3StorageDriver(config);
          case 'local':
            return new LocalStorageDriver(config);
          default:
            /* Unreachable while the env schema restricts this to a known
             * enum, but kept so adding a value there without adding a case
             * here fails loudly instead of silently selecting local. */
            new Logger(StorageModule.name).error(
              `Unknown STORAGE_DRIVER "${driver}"`,
            );
            throw new Error(
              `Unsupported STORAGE_DRIVER "${driver}". Expected "local" or "s3".`,
            );
        }
      },
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
