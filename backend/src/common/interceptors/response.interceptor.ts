import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';

/** Envelope padrão de sucesso: { success: true, data, meta? }. */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map((body) => {
      if (body && typeof body === 'object' && 'items' in body && 'meta' in body) return { success: true, data: body.items, meta: body.meta };
      if (body && typeof body === 'object' && body.__raw) return body.payload;
      return { success: true, data: body ?? null };
    }));
  }
}
