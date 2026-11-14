import { Module } from '@nestjs/common';
import { MinisterioSaudeClient } from './ministerio-saude.client';
import { MinisterioSaudeController, PublicStatsController } from './ministerio-saude.controller';
import { MinisterioSaudeService } from './ministerio-saude.service';

@Module({
  controllers: [MinisterioSaudeController, PublicStatsController],
  providers: [{ provide: MinisterioSaudeClient, useFactory: () => new MinisterioSaudeClient() }, MinisterioSaudeService],
  exports: [MinisterioSaudeClient, MinisterioSaudeService],
})
export class MinisterioSaudeModule {}
