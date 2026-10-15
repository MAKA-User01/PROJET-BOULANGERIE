import { Component } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AdminService } from '../../core/admin.service';
import { AuthService } from '../../core/auth.service';
import { Backup, Settings } from '../../core/models';
import { StoreService } from '../../core/store.service';

@Component({
  selector: 'tm-administration',
  templateUrl: './administration.component.html',
  styles: [`
    .policy { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .policy div { padding: 14px; border-radius: 14px; background: var(--flour); }
    .policy small { display: block; color: var(--ink-400); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .policy strong { display: block; margin-top: 4px; font-size: 14px; }
    .danger-zone { border-color: #f3c9c2; }
    @media (max-width: 760px) { .policy { grid-template-columns: 1fr; } }
  `]
})
export class AdministrationComponent {
  technical: Pick<Settings, 'nomEtablissement' | 'sessionTimeoutMin' | 'maxTentatives' | 'verrouillageMin' | 'mfaPrivilegies'>;
  requestMotif = '';
  confirmRestore: Backup | null = null;
  readonly demo = environment.demo;

  constructor(readonly auth: AuthService, readonly admin: AdminService, private readonly store: StoreService) {
    const settings = admin.settings;
    this.technical = {
      nomEtablissement: settings.nomEtablissement, sessionTimeoutMin: settings.sessionTimeoutMin, maxTentatives: settings.maxTentatives,
      verrouillageMin: settings.verrouillageMin, mfaPrivilegies: settings.mfaPrivilegies
    };
  }

  get lastBackup(): Backup | undefined {
    return this.admin.backups[0];
  }

  get dataSize(): number {
    try {
      return (localStorage.getItem('tammak.db.v2') || '').length;
    } catch {
      return 0;
    }
  }

  get auditCount(): number {
    return this.store.state.audit.length;
  }

  saveTechnical(): void {
    this.admin.updateTechnical({
      ...this.technical,
      sessionTimeoutMin: Number(this.technical.sessionTimeoutMin),
      maxTentatives: Number(this.technical.maxTentatives),
      verrouillageMin: Number(this.technical.verrouillageMin)
    });
  }

  restore(): void {
    if (this.confirmRestore) {
      this.admin.restore(this.confirmRestore);
      this.confirmRestore = null;
    }
  }

  requestBackup(): void {
    this.admin.requestBackup(this.requestMotif);
    this.requestMotif = '';
  }

  resetDemo(): void {
    if (window.confirm('Réinitialiser toutes les données de démonstration ? Cette action efface aussi le journal local.')) {
      this.store.resetDemo();
      this.auth.logout();
    }
  }

  size(bytes: number): string {
    return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} Mo` : `${Math.round(bytes / 1024)} Ko`;
  }
}
