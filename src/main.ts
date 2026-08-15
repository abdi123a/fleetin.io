import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { resolve } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import './common/bigint-json.patch';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  // Pino Logger Setup
  const logger = app.get(Logger);
  app.useLogger(logger);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');

  /* Serves whatever LocalStorageDriver wrote under STORAGE_LOCAL_PATH at the
   * `/uploads` prefix it already assumes (storage.types.ts's StoredObject.url
   * and LocalStorageDriver.getUrl() both hardcode this). Registered before
   * setGlobalPrefix so these paths are NOT prefixed with /api/v1 — a browser
   * <img src> or direct link should hit /uploads/... directly. Harmless when
   * STORAGE_DRIVER=s3 (S3 returns its own presigned URLs; this folder is
   * simply never populated). */
  app.useStaticAssets(resolve(configService.get<string>('STORAGE_LOCAL_PATH', './uploads')), {
    prefix: '/uploads',
  });

  app.setGlobalPrefix(apiPrefix);

  // CORS Configuration
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global Pipelines & Filters
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger OpenAPI Documentation
  const config = new DocumentBuilder()
    .setTitle('FLEETIN API')
    .setDescription('FLEETIN Internal Management System Core REST API Specification')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT Bearer Token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port);
  logger.log(`🚀 FLEETIN Backend is running on: http://localhost:${port}/${apiPrefix}`);
  logger.log(`📚 OpenAPI / Swagger Docs: http://localhost:${port}/api/docs`);
}

bootstrap();
