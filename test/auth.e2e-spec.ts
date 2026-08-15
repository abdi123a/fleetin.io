import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, uniqueEmail, deleteTestUsers } from './setup-app';
import { PrismaService } from '../src/modules/prisma/prisma.service';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@fleetin.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@Fleetin2026!';

describe('Authentication & authorization (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await deleteTestUsers(prisma);
    await app.close();
  });

  /* Returns the supertest Test rather than a promise, so `.expect(...)` still
   * chains off it — awaiting inside the helper would collapse it to a plain
   * Promise<Response>, which has no `.expect`. */
  const login = (email: string, password: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });

  /* ---------------------------------------------------------------------- */

  describe('login', () => {
    it('issues an access and refresh token for valid credentials', async () => {
      const response = await login(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200);

      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.user.email).toBe(ADMIN_EMAIL);
    });

    it('never returns the password hash', async () => {
      const response = await login(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200);
      expect(JSON.stringify(response.body)).not.toContain('argon2');
      expect(response.body.data.user).not.toHaveProperty('passwordHash');
    });

    it('rejects a wrong password', async () => {
      await login(ADMIN_EMAIL, 'DefinitelyNotThePassword!').expect(401);
    });

    it('rejects an unknown account with the same message, to prevent enumeration', async () => {
      const unknown = await login('nobody@e2e.fleetin.test', 'whatever123!').expect(401);
      const wrongPassword = await login(ADMIN_EMAIL, 'whatever123!').expect(401);

      expect(unknown.body.message).toBe(wrongPassword.body.message);
    });

    it('stores only a hash of the refresh token, never the token itself', async () => {
      const response = await login(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200);
      const refreshToken: string = response.body.data.refreshToken;

      const rows = await prisma.refreshToken.findMany({ take: 100 });
      const storedValues = rows.map((row) => row.tokenHash);

      expect(storedValues).not.toContain(refreshToken);
      /* SHA-256 hex is always 64 characters. */
      storedValues.forEach((hash) => expect(hash).toHaveLength(64));
    });
  });

  /* ---------------------------------------------------------------------- */

  describe('refresh rotation', () => {
    it('exchanges a refresh token for a new pair', async () => {
      const session = await login(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200);
      const original: string = session.body.data.refreshToken;

      const refreshed = await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: original })
        .expect(200);

      expect(refreshed.body.data.refreshToken).toBeDefined();
      expect(refreshed.body.data.refreshToken).not.toBe(original);
    });

    it('revokes the old token and links it to its successor', async () => {
      const session = await login(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200);
      const original: string = session.body.data.refreshToken;

      await http.post('/api/v1/auth/refresh').send({ refreshToken: original }).expect(200);

      const { createHash } = await import('crypto');
      const originalHash = createHash('sha256').update(original).digest('hex');

      const stored = await prisma.refreshToken.findUnique({
        where: { tokenHash: originalHash },
      });

      expect(stored?.isRevoked).toBe(true);
      expect(stored?.revokedAt).not.toBeNull();
      expect(stored?.replacedById).not.toBeNull();
    });

    it('keeps the rotated token in the same family', async () => {
      const session = await login(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200);
      const original: string = session.body.data.refreshToken;

      const refreshed = await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: original })
        .expect(200);

      const { createHash } = await import('crypto');
      const hashOf = (token: string) =>
        createHash('sha256').update(token).digest('hex');

      const before = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashOf(original) },
      });
      const after = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashOf(refreshed.body.data.refreshToken) },
      });

      expect(after?.familyId).toBe(before?.familyId);
    });

    it('rejects a token that was never issued', async () => {
      await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'not.a.real.token' })
        .expect(401);
    });
  });

  /* ---------------------------------------------------------------------- */

  describe('refresh reuse detection', () => {
    it('rejects a replayed token and revokes the entire family', async () => {
      const session = await login(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200);
      const stolen: string = session.body.data.refreshToken;

      /* Legitimate rotation — `stolen` is now spent. */
      const rotated = await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: stolen })
        .expect(200);
      const legitimate: string = rotated.body.data.refreshToken;

      /* The thief replays the old token. */
      await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: stolen })
        .expect(401);

      /* The victim's still-valid token must now be dead too: we cannot tell
       * which party is the attacker, so the whole session is torn down. */
      await http
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: legitimate })
        .expect(401);
    });

    it('marks every token in the family as revoked in the database', async () => {
      const session = await login(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200);
      const first: string = session.body.data.refreshToken;

      await http.post('/api/v1/auth/refresh').send({ refreshToken: first }).expect(200);
      await http.post('/api/v1/auth/refresh').send({ refreshToken: first }).expect(401);

      const { createHash } = await import('crypto');
      const firstRow = await prisma.refreshToken.findUnique({
        where: { tokenHash: createHash('sha256').update(first).digest('hex') },
      });

      const family = await prisma.refreshToken.findMany({
        where: { familyId: firstRow!.familyId },
      });

      expect(family.length).toBeGreaterThanOrEqual(2);
      expect(family.every((token) => token.isRevoked)).toBe(true);
    });
  });

  /* ---------------------------------------------------------------------- */

  describe('logout', () => {
    it('requires authentication', async () => {
      await http
        .post('/api/v1/auth/logout')
        .send({ refreshToken: 'someone-elses-token' })
        .expect(401);
    });

    it('revokes the caller’s own session family', async () => {
      const session = await login(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200);
      const { accessToken, refreshToken } = session.body.data;

      await http
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      /* The refresh token from that session must no longer work. */
      await http.post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
    });
  });

  /* ---------------------------------------------------------------------- */

  describe('protected routes', () => {
    it('rejects a request with no token', async () => {
      await http.get('/api/v1/auth/me').expect(401);
    });

    it('rejects a malformed token', async () => {
      await http
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer garbage.token.value')
        .expect(401);
    });

    it('returns the profile for a valid token', async () => {
      const session = await login(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200);

      const profile = await http
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${session.body.data.accessToken}`)
        .expect(200);

      expect(profile.body.data.email).toBe(ADMIN_EMAIL);
      expect(profile.body.data.permissions).toContain('*');
    });
  });

  /* ---------------------------------------------------------------------- */

  describe('permission authorization', () => {
    let clientAccessToken: string;

    beforeAll(async () => {
      const registration = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: uniqueEmail('permission.client'),
          password: 'ClientPass@2026!',
          firstName: 'Perm',
          lastName: 'Client',
        })
        .expect(201);

      clientAccessToken = registration.body.data.accessToken;
    });

    it('assigns self-registered users the least-privileged role', async () => {
      const profile = await http
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .expect(200);

      expect(profile.body.data.role.name).toBe('CLIENT');
    });

    it('denies a route whose permission the role lacks', async () => {
      const response = await http
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .expect(403);

      expect(response.body.message).toContain('users.view');
    });

    it('denies role administration to a client', async () => {
      await http
        .get('/api/v1/roles')
        .set('Authorization', `Bearer ${clientAccessToken}`)
        .expect(403);
    });

    it('allows a route the wildcard grant covers', async () => {
      const session = await login(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200);

      await http
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${session.body.data.accessToken}`)
        .expect(200);
    });

    it('reflects a permission change without reissuing the token', async () => {
      const session = await login(ADMIN_EMAIL, ADMIN_PASSWORD).expect(200);
      const token = session.body.data.accessToken;

      const admin = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });

      /* Strip the wildcard while the token stays valid. Because the guard
       * reads permissions from the database per request rather than from the
       * JWT body, access must drop immediately. */
      await prisma.role.update({
        where: { id: admin.id },
        data: { permissions: ['health.view'] },
      });

      try {
        await http
          .get('/api/v1/users')
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      } finally {
        await prisma.role.update({
          where: { id: admin.id },
          data: { permissions: admin.permissions as string[] },
        });
      }
    });
  });
});
