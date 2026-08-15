import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T> | StreamableFile> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T> | StreamableFile> {
    return next.handle().pipe(
      map((data) => {
        // A binary/streamed response (e.g. GET /documents/:id/download) must
        // reach Nest's own StreamableFile handling untouched — wrapping it in
        // the {success, data, timestamp} envelope serialises the stream's
        // internals as JSON instead of sending the file's bytes.
        if (data instanceof StreamableFile) return data;

        return {
          success: true,
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
