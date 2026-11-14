import { MigrationInterface, QueryRunner } from "typeorm";

export class AddExamCancelledStatus1794642980475 implements MigrationInterface {
    name = 'AddExamCancelledStatus1794642980475'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`exams\` CHANGE \`status\` \`status\` enum ('Solicitado', 'Agendado', 'Em análise', 'Resultado disponível', 'Cancelado') NOT NULL DEFAULT 'Solicitado'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`exams\` CHANGE \`status\` \`status\` enum ('Solicitado', 'Agendado', 'Em análise', 'Resultado disponível') NOT NULL DEFAULT 'Solicitado'`);
    }

}
