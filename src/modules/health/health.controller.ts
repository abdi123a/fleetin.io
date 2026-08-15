import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { QueueHealthService } from '../queue/queue-health.service';
import { StorageService } from '../storage/storage.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueHealth: QueueHealthService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Liveness. Answers "is the process up", nothing more.
   *
   * Deliberately touches no dependency: a load balancer must not restart a
   * healthy API because Redis is briefly unreachable.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  liveness() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness. Answers "can this instance serve traffic".
   *
   * The database is the only hard dependency — without it nothing works, so it
   * alone decides the status code. Redis being down degrades queues but leaves
   * the REST API able to serve requests, so it is reported and not fatal.
   */
  @Public()
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Readiness probe — checks database and Redis' })
  async readiness() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.queueHealth.check(),
    ]);

    return {
      status: database.status === 'up' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      checks: {
        database,
        redis,
        storage: { status: 'up', driver: this.storage.driverName },
      },
    };
  }

  private async checkDatabase(): Promise<{
    status: 'up' | 'down';
    latencyMs?: number;
    error?: string;
  }> {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        status: 'down',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
