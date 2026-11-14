import { Module } from '@nestjs/common';
import { HealthUnitsController, PublicController } from './health-units/health-units.controller';
import { HealthUnitsService } from './health-units/health-units.service';
import { ProfessionalsController } from './professionals/professionals.controller';
import { ProfessionalsService } from './professionals/professionals.service';
import { PatientsController } from './patients/patients.controller';
import { PatientsService } from './patients/patients.service';
import { AttendancesController } from './attendances/attendances.controller';
import { AttendancesService } from './attendances/attendances.service';
import { ExamsController } from './exams/exams.controller';
import { ExamsService } from './exams/exams.service';
import { PrescriptionsController } from './prescriptions/prescriptions.controller';
import { PrescriptionsService } from './prescriptions/prescriptions.service';
import { ReferralsController, ReferralsService } from './referrals/referrals';
import { AppointmentsController, AppointmentsService } from './appointments/appointments';
import { NotificationsController } from './notifications/notifications.controller';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { MinisterioSaudeModule } from '../integrations/ministerio-saude/ministerio-saude.module';

@Module({ imports: [MinisterioSaudeModule], controllers: [HealthUnitsController, PublicController], providers: [HealthUnitsService], exports: [HealthUnitsService] })
export class HealthUnitsModule {}
@Module({ controllers: [ProfessionalsController], providers: [ProfessionalsService] })
export class ProfessionalsModule {}
@Module({
  controllers: [PatientsController, AttendancesController, ExamsController, PrescriptionsController, ReferralsController, AppointmentsController],
  providers: [PatientsService, AttendancesService, ExamsService, PrescriptionsService, ReferralsService, AppointmentsService],
})
export class ClinicalModule {}
@Module({ controllers: [NotificationsController] })
export class NotificationsModule {}
@Module({ controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}

export const DomainModules = [HealthUnitsModule, ProfessionalsModule, ClinicalModule, NotificationsModule, AdminModule];
