import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';

/**
 * Foundation checks: the app boots, the database answers, and the global
 * response/validation wiring behaves as `main.ts` configures it.
 */
describe('Application foundation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('boot', () => {
    it('creates the application context', () => {
      expect(app).toBeDefined();
    });

    it('serves the liveness probe', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ok');
    });
  });

  describe('database connection', () => {
    it('executes a query', async () => {
      const result = await prisma.$queryRaw`SELECT 1 AS ok`;
      expect(result).toBeDefined();
    });

    it('reports the database as up via readiness', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);

      expect(response.body.data.checks.database.status).toBe('up');
    });

    it('has the seeded baseline roles', async () => {
      const roles = await prisma.role.findMany({ select: { name: true } });
      const names = roles.map((role) => role.name);

      expect(names).toEqual(
        expect.arrayContaining(['ADMIN', 'MANAGER', 'DISPATCHER', 'DRIVER', 'CLIENT']),
      );
    });
  });

  describe('global wiring', () => {
    it('wraps responses in the transform envelope', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('formats errors through the exception filter', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .expect(401);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 401,
        path: '/api/v1/users',
        method: 'GET',
      });
    });

    it('rejects unknown properties via the global validation pipe', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@fleetin.com',
          password: 'whatever',
          unexpectedField: 'should be rejected',
        })
        .expect(400);
    });

    it('rejects a malformed payload', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email' })
        .expect(400);
    });
  });
});
