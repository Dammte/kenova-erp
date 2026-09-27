import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';

/**
 * Last line of defence for error responses:
 * - HTTP exceptions pass through unchanged.
 * - Known database constraint errors become 409/400 with a generic message.
 * - Anything else becomes a 500 without internals (SQL, stack, parameters).
 * Only the error code/class is logged, never query parameters (they contain PII).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host
      .switchToHttp()
      .getRequest<{ method: string; route?: { path?: string }; url: string }>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json(exception.getResponse());
      return;
    }

    if (exception instanceof QueryFailedError) {
      const code = (
        exception as QueryFailedError & { driverError?: { code?: string } }
      ).driverError?.code;
      const route = `${req.method} ${req.route?.path ?? req.url.split('?')[0]}`;
      if (code === '23505') {
        res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: 'Ya existe un registro con esos datos (valor duplicado)',
          error: 'Conflict',
        });
        return;
      }
      if (code === '23503') {
        res.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message:
            'El registro está en uso o hace referencia a otro que no existe',
          error: 'Conflict',
        });
        return;
      }
      if (
        code === '22P02' ||
        code === '22001' ||
        code === '22003' ||
        code === '23502'
      ) {
        res.status(HttpStatus.BAD_REQUEST).json({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Datos no válidos',
          error: 'Bad Request',
        });
        return;
      }
      this.logger.error(`Database error ${code ?? 'unknown'} on ${route}`);
    } else {
      const err = exception as Error;
      this.logger.error(
        `${err?.name ?? 'Error'} on ${req.method} ${req.url.split('?')[0]}: ${err?.message}`,
        err?.stack,
      );
    }

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Error interno del servidor',
      error: 'Internal Server Error',
    });
  }
}
