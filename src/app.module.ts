import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { validateEnvironment } from './config/env.config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { StorageModule } from './modules/storage/storage.module';
import { QueueModule } from './modules/queue/queue.module';
import { MailModule } from './modules/mail/mail.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { HealthModule } from './modules/health/health.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ShippersModule } from './modules/shippers/shippers.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { PartnersModule } from './modules/partners/partners.module';
import { ShipmentsModule } from './modules/shipments/shipments.module';
import { BiModule } from './modules/bi/bi.module';
import { EmptyReturnsModule } from './modules/empty-returns/empty-returns.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { LocationsModule } from './modules/locations/locations.module';
import { EmissionsModule } from './modules/emissions/emissions.module';
import { BankAccountsModule } from './modules/bank-accounts/bank-accounts.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { HrModule } from './modules/hr/hr.module';
import { SettingsModule } from './modules/settings/settings.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        /* Silent under test: a request log per assertion buries the actual
         * failure output. */
        level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
        transport:
          process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
        /* Bearer tokens and cookies must never reach the log sink — these
         * paths are replaced before serialisation, not after. */
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.refreshToken',
            'res.headers["set-cookie"]',
          ],
          censor: '[redacted]',
        },
        /* Health probes run constantly and would otherwise dominate the log. */
        autoLogging: {
          ignore: (req) => (req.url ?? '').includes('/health'),
        },
      },
    }),
    PrismaModule,
    StorageModule,
    QueueModule,
    MailModule,
    AuthModule,
    UsersModule,
    RolesModule,
    HealthModule,
    DocumentsModule,
    ShippersModule,
    VehiclesModule,
    DriversModule,
    PartnersModule,
    ShipmentsModule,
    BiModule,
    EmptyReturnsModule,
    BookingsModule,
    BankAccountsModule,
    InvoicesModule,
    ProjectsModule,
    SettingsModule,
    HrModule,
    WorkspaceModule,
    LocationsModule,
    EmissionsModule,
  ],
  providers: [
    /* Order matters. Nest runs global guards in registration order, so
     * authentication resolves `request.user` before authorization reads its
     * permissions. Reversing these would make every permission check see an
     * undefined user. */
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
