import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Health probes.
 *
 * No providers of its own — PrismaService, QueueHealthService and
 * StorageService all come from global modules.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
