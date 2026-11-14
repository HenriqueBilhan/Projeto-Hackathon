import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Notification, User } from '../../database/entities';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  notifyUser(userId: string, title: string, message: string, link: string | null = null, icon = 'bell') {
    return this.repo.insert({ userId, title: title.slice(0, 120), message: message.slice(0, 500), link, icon });
  }

  /** Notifica o paciente (se ele possuir conta). */
  async notifyPatient(patientId: string, title: string, message: string, link: string | null = null, icon = 'bell', dedupeToday = false) {
    const user = await this.users.findOne({ where: { patientId, active: true } });
    if (!user) return;
    if (dedupeToday) {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const exists = await this.repo.count({ where: { userId: user.id, title, message, createdAt: Between(start, new Date()) } });
      if (exists) return;
    }
    await this.notifyUser(user.id, title, message, link, icon);
  }

  async notifyProfessional(professionalId: string, title: string, message: string, link: string | null = null, icon = 'bell') {
    const user = await this.users.findOne({ where: { professionalId, active: true } });
    if (user) await this.notifyUser(user.id, title, message, link, icon);
  }

  async notifyAdmins(title: string, message: string, link: string | null = null, icon = 'bell') {
    const admins = await this.users.createQueryBuilder('u').innerJoin('u.role', 'r').where('r.code = :c', { c: 'admin' }).andWhere('u.active = 1').getMany();
    for (const a of admins) await this.notifyUser(a.id, title, message, link, icon);
  }
}
