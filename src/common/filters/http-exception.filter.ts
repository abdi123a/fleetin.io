import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    /* A Nest HttpException body is either a string or an object carrying a
     * `message` — validation errors put an array of strings there. Narrowing
     * with `in` keeps that shape without asserting `any`. */
    const message =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? 'message' in exceptionResponse
          ? (exceptionResponse as { message: string | string[] }).message
          : exceptionResponse
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    /* Severity follows the class of failure, not the fact that an exception
     * was thrown. A 401 or 403 is the authorization layer working correctly —
     * logging those at `error` with a full stack trace buries genuine 5xx
     * faults under routine traffic, and makes the test output unreadable.
     * Only 5xx carries a stack, because only 5xx is our bug. */
    const context = `HTTP ${status} on ${request.method} ${request.url}`;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(context, exception instanceof Error ? exception.stack : '');
    } else {
      this.logger.debug(context);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
    });
  }
}
