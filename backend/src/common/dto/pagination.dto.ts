import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Parâmetros comuns de paginação e ordenação. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 500 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  limit = 20;

  @ApiPropertyOptional({ description: 'Campo de ordenação (lista permitida por endpoint)' })
  @IsOptional() @IsString() @MaxLength(40)
  sort?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional() @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  order?: string;
}

export interface Paginated<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export function paginated<T>(items: T[], total: number, q: { page: number; limit: number }): Paginated<T> {
  return { items, meta: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } };
}

/** Resolve a coluna de ordenação a partir de uma lista branca (evita injeção em ORDER BY). */
export function resolveSort(q: PaginationQueryDto, allowed: Record<string, string>, fallback: string): [string, 'ASC' | 'DESC'] {
  const col = (q.sort && allowed[q.sort]) || allowed[fallback] || fallback;
  return [col, (q.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'];
}
