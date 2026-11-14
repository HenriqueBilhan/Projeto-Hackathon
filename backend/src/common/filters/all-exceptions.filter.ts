import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { QueryFailedError, EntityNotFoundError } from 'typeorm';

/**
 * Tratamento centralizado de erros. Formato padronizado:
 * { success: false, error: { statusCode, code, message, details, path, timestamp } }
 * Erros internos nunca expõem stack trace nem dados clínicos ao cliente.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = 'Erro interno do servidor.';
    let code = 'INTERNAL_ERROR';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as any;
      if (typeof body === 'string') message = body;
      else {
        message = Array.isArray(body.message) ? 'Dados inválidos.' : body.message || exception.message;
        if (Array.isArray(body.message)) details = body.message;
        if (body.code) code = body.code;
        if (body.details) details = body.details;
      }
      if (code === 'INTERNAL_ERROR') code = HttpStatus[status] || 'ERROR';
    } else if (exception instanceof EntityNotFoundError) {
      status = HttpStatus.NOT_FOUND; message = 'Registro não encontrado.'; code = 'NOT_FOUND';
    } else if (exception instanceof QueryFailedError && (exception as any).driverError?.code === 'ER_DUP_ENTRY') {
      status = HttpStatus.CONFLICT; message = 'Registro duplicado.'; code = 'DUPLICATE';
    } else if (exception instanceof QueryFailedError && (exception as any).driverError?.code === 'ER_ROW_IS_REFERENCED_2') {
      status = HttpStatus.CONFLICT; message = 'Registro possui vínculos e não pode ser excluído.'; code = 'IN_USE';
    }

    if (status >= 500) this.logger.error({ err: exception instanceof Error ? { name: exception.name, message: exception.message, stack: exception.stack } : exception, path: req.url }, 'Erro não tratado');
    res.status(status).json({ success: false, error: { statusCode: status, code, message, details, path: req.url, timestamp: new Date().toISOString() } });
  }
}
