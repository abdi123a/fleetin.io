import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import '../src/common/bigint-json.patch';

/**
 * Boot the real application for end-to-end tests.
 *
 * The global pipe, filter and interceptor are applied here exactly as
 * `main.ts` applies them. If they were left out, the tests would exercise a
 * subtly different app than production runs — validation and the response
 * envelope are the two things most likely to break a client, so they must be
 * under test rather than bypassed.
 */
export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.setGlobalPrefix('api/v1');

  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

/** Unique email per run, so repeated runs never collide on the unique index. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 10000)}@e2e.fleetin.test`;
}

/** Remove users (and their cascaded tokens) created by a test run. */
export async function deleteTestUsers(prisma: PrismaService): Promise<void> {
  await prisma.user.deleteMany({
    where: { email: { endsWith: '@e2e.fleetin.test' } },
  });
}
