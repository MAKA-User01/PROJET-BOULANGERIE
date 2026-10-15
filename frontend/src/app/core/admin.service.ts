import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { sha256 } from './crypto';
import { Backup, DbState, Settings } from './models';
import { StoreService } from './store.service';
import { ToastService } from './toast.service';

type TechnicalKey = 'nomEtablissement' | 'sessionTimeoutMin' | 'maxTentatives' | 'verrouillageMin' | 'mfaPrivilegies';
type RuleKey = 'separationTaches' | 'seuilAchat' | 'seuilPaiement' | 'seuilEcartStock' | 'remiseMaxPct';

@Injectable({ providedIn: 'root' })
export class AdminService {
  constructor(private readonly store: StoreService, private readonly auth: AuthService, private readonly toast: ToastService) {}

  get settings(): Settings {
    return this.store.state.settings;
  }

  get backups(): Backup[] {
    return [...this.store.state.backups].sort((a, b) => b.date.localeCompare(a.date));
  }

  updateTechnical(values: Pick<Settings, TechnicalKey>): void {
    if (!this.auth.require('config:gerer', 'Configuration', 'modification de la configuration technique')) {
      return;
    }
    if (values.sessionTimeoutMin < 2 || values.sessionTimeoutMin > 120 || values.maxTentatives < 3 || values.maxTentatives > 10 || values.verrouillageMin < 1) {
      this.toast.error('Valeurs hors limites', 'Session : 2–120 min · tentatives : 3–10 · verrouillage ≥ 1 min.');
      return;
    }
    this.apply(values, 'Modification de la configuration technique', 'Configuration');
  }

  updateRules(values: Pick<Settings, RuleKey>): void {
    if (!this.auth.require('regles:gerer', 'Règles de validation', 'modification des seuils')) {
      return;
    }
    if (values.seuilAchat < 0 || values.seuilPaiement < 0 || values.seuilEcartStock < 1 || values.remiseMaxPct < 0 || values.remiseMaxPct > 50) {
      this.toast.error('Valeurs hors limites', 'Les seuils doivent être positifs et la remise ≤ 50 %.');
      return;
    }
    this.apply(values, 'Modification des règles de validation', 'Règles de validation');
  }

  runBackup(): void {
    if (!this.auth.require('sauvegarde:executer', 'Sauvegardes', 'sauvegarde')) {
      return;
    }
    const contenu = this.store.snapshot();
    const backup: Backup = {
      id: this.store.uid('bk'), date: new Date().toISOString(), auteurId: this.auth.user!.id,
      taille: new Blob([contenu]).size, checksum: sha256(contenu), contenu
    };
    this.store.commit((db) => {
      db.backups.push(backup);
      db.backups = db.backups.slice(-5);
    });
    this.auth.trace('Sauvegarde exécutée', 'Sauvegardes', 'succes', { objet: backup.id, details: `SHA-256 ${backup.checksum.slice(0, 16)}… · ${backup.taille} octets` });
    this.toast.success('Sauvegarde terminée', `Empreinte ${backup.checksum.slice(0, 12)}…`);
  }

  /** Restauration dans un environnement de test isolé : vérifie l'intégrité sans toucher aux données réelles. */
  testRestore(backup: Backup): void {
    if (!this.auth.require('sauvegarde:executer', 'Sauvegardes', 'test de restauration')) {
      return;
    }
    let ok = sha256(backup.contenu) === backup.checksum;
    let details = ok ? 'Empreinte conforme' : 'Empreinte non conforme';
    if (ok) {
      try {
        const parsed = JSON.parse(backup.contenu) as DbState;
        ok = Array.isArray(parsed.users) && Array.isArray(parsed.products) && Array.isArray(parsed.sales) && parsed.version === 1;
        details = `${parsed.users.length} comptes · ${parsed.products.length} produits · ${parsed.sales.length} ventes relus`;
      } catch {
        ok = false;
        details = 'Contenu illisible';
      }
    }
    this.store.commit(() => {
      backup.testeLe = new Date().toISOString();
      backup.testeOk = ok;
    });
    this.auth.trace('Test de restauration', 'Sauvegardes', ok ? 'succes' : 'echec', { objet: backup.id, details });
    if (ok) {
      this.toast.success('Restauration testée avec succès', details);
    } else {
      this.toast.error('Test de restauration échoué', details);
    }
  }

  restore(backup: Backup): void {
    if (!this.auth.require('sauvegarde:executer', 'Sauvegardes', 'restauration')) {
      return;
    }
    if (sha256(backup.contenu) !== backup.checksum) {
      this.toast.error('Restauration annulée', 'L’empreinte de la sauvegarde ne correspond pas.');
      return;
    }
    const snapshot = JSON.parse(backup.contenu) as DbState;
    this.store.restoreBusinessData({ ...snapshot, audit: [], backups: [] });
    this.auth.trace('Restauration des données métier', 'Sauvegardes', 'succes', { objet: backup.id, details: 'Journal d’audit conservé' });
    this.toast.success('Données restaurées', 'Le journal d’audit a été conservé intégralement.');
  }

  download(backup: Backup): void {
    if (!this.auth.require('sauvegarde:executer', 'Sauvegardes', 'export de sauvegarde')) {
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([backup.contenu], { type: 'application/json' }));
    link.download = `tammak-sauvegarde-${backup.date.slice(0, 16).replace(/[:T]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    this.auth.trace('Export de sauvegarde', 'Sauvegardes', 'succes', { objet: backup.id });
  }

  requestBackup(motif: string): void {
    if (!this.auth.require('sauvegarde:valider', 'Sauvegardes', 'demande de sauvegarde')) {
      return;
    }
    this.auth.trace('Demande de sauvegarde (besoin métier)', 'Sauvegardes', 'succes', { motif: motif || 'Sauvegarde avant opération sensible' });
    this.toast.success('Demande transmise', 'L’administrateur technique a été notifié via le journal.');
  }

  private apply(values: Partial<Settings>, action: string, ressource: string): void {
    const settings = this.store.state.settings as unknown as { [key: string]: unknown };
    const changes = Object.entries(values)
      .filter(([key, value]) => settings[key] !== value)
      .map(([key, value]) => `${key} : ${settings[key]} → ${value}`);
    if (!changes.length) {
      this.toast.info('Aucune modification');
      return;
    }
    this.store.commit((db) => Object.assign(db.settings, values));
    this.auth.trace(action, ressource, 'succes', { details: changes.join(' ; ') });
    this.toast.success('Paramètres enregistrés', `${changes.length} modification(s) journalisée(s).`);
  }
}
