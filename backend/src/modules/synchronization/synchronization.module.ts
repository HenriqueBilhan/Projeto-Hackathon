import { Module } from '@nestjs/common';
import { MinisterioSaudeModule } from '../../integrations/ministerio-saude/ministerio-saude.module';
import { SynchronizationController } from './synchronization.controller';
import { SynchronizationService } from './synchronization.service';

@Module({ imports: [MinisterioSaudeModule], controllers: [SynchronizationController], providers: [SynchronizationService], exports: [SynchronizationService] })
export class SynchronizationModule {}
