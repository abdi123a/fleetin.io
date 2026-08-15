import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueHealthService } from './queue-health.service';

/**
 * Queue infrastructure.
 *
 * This module establishes the shared Redis connection and the default job
 * policy, and nothing else — there are deliberately no queues registered and
 * no processors here. A feature module that needs one later declares it
 * locally:
 *
 *   @Module({
 *     imports: [BullModule.registerQueue({ name: 'documents' })],
 *     providers: [DocumentsProcessor],
 *   })
 *
 * `forRoot` having already run means that registration inherits the connection
 * and defaults below without repeating them.
 *
 * Marked `@Global` so `BullModule.registerQueue` works from any feature module
 * without re-importing the root configuration.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
          /* Empty string in .env means "no auth"; undefined keeps ioredis from
           * sending an AUTH command a local Redis would reject. */
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          /* BullMQ requires this to be null: it uses blocking commands, and a
           * retry ceiling would make a worker give up on a stalled connection
           * instead of reconnecting. */
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          /* Keep a bounded window of finished jobs: enough to debug a failure,
           * not so much that Redis becomes a log store. */
          removeOnComplete: { age: 3600, count: 100 },
          removeOnFail: { age: 86400, count: 500 },
        },
      }),
    }),
  ],
  providers: [QueueHealthService],
  exports: [BullModule, QueueHealthService],
})
export class QueueModule {}
