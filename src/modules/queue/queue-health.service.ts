import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface RedisHealth {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

/**
 * Liveness probe for the Redis backing the queues.
 *
 * Holds its own lightweight ioredis client rather than borrowing BullMQ's:
 * BullMQ's connections are reserved for blocking commands, and issuing an
 * out-of-band PING on one can stall a worker that is parked on BRPOPLPUSH.
 *
 * `lazyConnect` keeps the connection out of the boot path — a Redis outage
 * should surface as a degraded health check, not as a process that refuses to
 * start and takes the whole HTTP API down with it.
 */
@Injectable()
export class QueueHealthService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueHealthService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): Redis {
    if (!this.client) {
      this.client = new Redis({
        host: this.config.getOrThrow<string>('REDIS_HOST'),
        port: this.config.getOrThrow<number>('REDIS_PORT'),
        password: this.config.get<string>('REDIS_PASSWORD') || undefined,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        /* Bounded so a health check cannot hang the request that called it. */
        connectTimeout: 2000,
        retryStrategy: () => null,
      });

      /* ioredis emits 'error' on an EventEmitter with no listener, which would
       * otherwise crash the process on an unreachable Redis. */
      this.client.on('error', (error) => {
        this.logger.debug(`Redis health client error: ${error.message}`);
      });
    }

    return this.client;
  }

  async check(): Promise<RedisHealth> {
    const startedAt = Date.now();

    try {
      const client = this.getClient();
      if (client.status !== 'ready') {
        await client.connect();
      }
      await client.ping();
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: 'down', error: message };
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }
}
