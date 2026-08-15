# FLEETIN Backend Infrastructure

REST API backend for the **FLEETIN Internal Management System** — NestJS, TypeScript, Prisma, MySQL, JWT auth with refresh-token rotation, and permission-based access control.

> **Status: foundation only.** Authentication, authorization, storage, queues and health are in place. No business modules (partners, vehicles, drivers, shipments, bookings, empty returns, finance features) exist yet — those come in the next phase, after a frontend-to-backend domain analysis.

---

## 🛠 Tech Stack

| Component | Technology |
|---|---|
| **Runtime** | Node.js 20+ |
| **Language** | TypeScript |
| **Framework** | NestJS 11 |
| **Database** | MySQL |
| **ORM** | Prisma |
| **Password hashing** | **Argon2id** (OWASP parameters) |
| **Auth** | JWT access + refresh rotation with reuse detection |
| **Authorization** | Permission-based (`resource.action`) + roles |
| **Validation** | class-validator (DTOs) & Zod (environment) |
| **Documentation** | Swagger / OpenAPI (`/api/docs`) |
| **Logging** | Pino (`nestjs-pino`), with secret redaction |
| **Cache & Queues** | Redis + BullMQ |
| **File Storage** | `StorageService` → local driver (dev) / S3 driver (prod) |
| **Email** | Resend |
| **Testing** | Jest + Supertest |
| **Package Manager** | **pnpm** |

---

## 🚀 Quick Start

### 1. Requirements

MySQL and Redis must be running. Either use Docker Compose:

```bash
docker-compose up -d
```

…or local services (macOS/Homebrew):

```bash
brew services start mysql
brew services start redis
```

### 2. Environment

```bash
cp .env.example .env
```

Then generate the two JWT secrets — they are **required**, must be ≥32 characters, and must differ from each other:

```bash
openssl rand -base64 48
```

The app validates the whole environment at boot and refuses to start if anything is missing. There are no fallback secrets in source.

### 3. Install & generate

```bash
pnpm install
pnpm prisma:generate
```

### 4. Database

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS fleetin_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
pnpm prisma migrate deploy
pnpm prisma:seed
```

Default seeded credentials (development only — override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`):

- **Email**: `admin@fleetin.com`
- **Password**: `Admin@Fleetin2026!`

### 5. Run

```bash
pnpm start:dev
```

---

## 📚 API

- **Swagger UI**: http://localhost:3000/api/docs
- **Base path**: `/api/v1`

### Endpoints

| Group | Route | Notes |
|---|---|---|
| Health | `GET /health` | Liveness. Public, touches no dependency. |
| Health | `GET /health/ready` | Readiness. Checks database + Redis + storage. |
| Auth | `POST /auth/register` | Public. Always assigns the `CLIENT` role. |
| Auth | `POST /auth/login` | Public. Returns access + refresh tokens. |
| Auth | `POST /auth/refresh` | Public. Rotates the refresh token. |
| Auth | `POST /auth/logout` | **Authenticated.** Revokes the caller's own session. |
| Auth | `POST /auth/logout-all` | Authenticated. Revokes every session for the user. |
| Auth | `GET /auth/me` | Authenticated. Profile + resolved permissions. |
| Users | `/users` | CRUD, gated on `users.*` permissions. |
| Roles | `/roles` | CRUD, gated on `roles.*` permissions. |

---

## 🔐 Security Model

**Passwords** — Argon2id (m=19 MiB, t=2, p=1). Hashes are transparently upgraded on next login when parameters change. All hashing goes through `src/common/security/password.util.ts`; the seed uses the same helper, so a seeded hash is always verifiable by the login path.

**Access tokens** — short-lived (15m default), signed with `JWT_SECRET`.

**Refresh tokens** — signed with a *separate* `JWT_REFRESH_SECRET`, and **only a SHA-256 digest is stored**. A database leak therefore does not hand over live sessions.

**Rotation and reuse detection** — every login opens a token *family*. Refreshing revokes the presented token and issues a successor in the same family. Presenting an already-rotated token proves two parties hold tokens from that family, so **the entire family is revoked** and both must re-authenticate.

**Authorization** — `PermissionsGuard` is global. Routes declare requirements with `@RequirePermissions(PERMISSIONS.users.view)`. Permissions are resolved from the **database on every request**, not from the JWT body, so a role change takes effect immediately rather than after the current token expires.

Permission naming is `resource.action`, defined once in `src/common/constants/permissions.ts`. Roles may hold `*` (all) or `resource.*` (all actions on one resource); endpoints always require a concrete permission.

---

## 🧱 Architecture Notes

**Guard order** — `JwtAuthGuard` then `PermissionsGuard`, registered in that order in `app.module.ts`. Authentication must populate `request.user` before authorization reads it. Every route is protected by default; `@Public()` opts out.

**Storage** — business code depends on `StorageService` only, never on `fs` or an S3 SDK. The driver is chosen once at boot from `STORAGE_DRIVER`. Persist the returned `key`, never the `url` (on S3 the URL is presigned and expires).

**Queues** — `QueueModule` establishes the Redis connection and default job policy. It registers **no queues and no processors**; a feature module adds its own with `BullModule.registerQueue({ name })`.

---

## 🧪 Commands

```bash
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint
pnpm test          # unit tests
pnpm test:e2e      # end-to-end tests (needs MySQL + Redis + seeded database)
pnpm build         # compile to dist/
```

---

## 📁 Layout

```
prisma/
  schema.prisma        16 models: auth (3) + finance (13)
  migrations/          applied migration history
  seed.ts              baseline roles + admin user
src/
  common/
    constants/         permission catalogue
    decorators/        @Public, @Roles, @RequirePermissions, @CurrentUser
    filters/           global HTTP exception filter
    guards/            JwtAuthGuard, RolesGuard, PermissionsGuard
    interceptors/      response envelope
    security/          Argon2 password helpers
  config/              Zod environment schema
  modules/
    auth/              login, rotation, reuse detection, logout
    health/            liveness + readiness
    prisma/            PrismaService
    queue/             BullMQ wiring + Redis health
    roles/  users/     administration
    storage/           StorageService + local/s3 drivers
    mail/              Resend wrapper
test/                  e2e specs
```
