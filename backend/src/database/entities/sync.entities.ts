import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Estado de sincronização por conjunto de dados (inclui trava contra execuções simultâneas). */
@Entity('synchronizations')
export class Synchronization {
  @PrimaryColumn({ length: 60 }) dataset: string;
  @Column({ type: 'enum', enum: ['idle', 'running', 'success', 'partial', 'failed'], default: 'idle' }) status: string;
  @Column({ name: 'lock_token', type: 'varchar', length: 36, nullable: true }) lockToken: string | null;
  @Column({ name: 'locked_at', type: 'datetime', nullable: true }) lockedAt: Date | null;
  @Column({ name: 'last_run_at', type: 'datetime', nullable: true }) lastRunAt: Date | null;
  @Column({ name: 'last_success_at', type: 'datetime', nullable: true }) lastSuccessAt: Date | null;
  @Column({ name: 'last_error', type: 'varchar', length: 500, nullable: true }) lastError: string | null;
  /** Estado incremental (ex.: última data de atualização consultada). */
  @Column({ type: 'json', nullable: true }) cursor: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  @Column({ name: 'last_log_id', type: 'bigint', unsigned: true, nullable: true }) lastLogId: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 }) updatedAt: Date;
}

/** Registro de cada execução de sincronização. */
@Entity('synchronization_logs')
@Index(['dataset', 'startedAt'])
@Index(['status'])
export class SynchronizationLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true }) id: string;
  @Column({ length: 60 }) dataset: string;
  @Column({ type: 'enum', enum: ['manual', 'auto', 'reprocess'] }) trigger: string;
  @Column({ type: 'enum', enum: ['full', 'incremental', 'reprocess'] }) mode: string;
  @Column({ type: 'enum', enum: ['running', 'success', 'partial', 'failed'], default: 'running' }) status: string;
  @Column({ name: 'started_at', type: 'datetime', precision: 3 }) startedAt: Date;
  @Column({ name: 'finished_at', type: 'datetime', precision: 3, nullable: true }) finishedAt: Date | null;
  @Column({ type: 'json', nullable: true }) params: Record<string, unknown> | null;
  @Column({ name: 'requests_made', type: 'int', unsigned: true, default: 0 }) requestsMade: number;
  @Column({ name: 'records_fetched', type: 'int', unsigned: true, default: 0 }) recordsFetched: number;
  @Column({ name: 'records_inserted', type: 'int', unsigned: true, default: 0 }) recordsInserted: number;
  @Column({ name: 'records_updated', type: 'int', unsigned: true, default: 0 }) recordsUpdated: number;
  @Column({ name: 'records_unchanged', type: 'int', unsigned: true, default: 0 }) recordsUnchanged: number;
  @Column({ name: 'records_invalid', type: 'int', unsigned: true, default: 0 }) recordsInvalid: number;
  @Column({ name: 'error_count', type: 'int', unsigned: true, default: 0 }) errorCount: number;
  /** Até 50 mensagens de erro (sem dados pessoais). */
  @Column({ type: 'json', nullable: true }) errors: string[] | null;
  /** Requisições que falharam após as tentativas — usadas no reprocessamento. */
  @Column({ name: 'failed_requests', type: 'json', nullable: true }) failedRequests: any[] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  @Column({ name: 'triggered_by', type: 'varchar', length: 36, nullable: true }) triggeredBy: string | null;
  @Column({ name: 'reprocess_of', type: 'bigint', unsigned: true, nullable: true }) reprocessOf: string | null;
}
