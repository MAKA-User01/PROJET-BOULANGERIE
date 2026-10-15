import { Component } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { AuditLog, AuditResult } from '../../core/models';
import { StoreService } from '../../core/store.service';

const SENSITIVE_RESOURCES = ['Session', 'Utilisateurs & rôles', 'Configuration', 'Règles de validation', 'Sauvegardes'];

@Component({
  selector: 'tm-audit',
  templateUrl: './audit.component.html',
  styles: [`
    .integrity { display: flex; align-items: center; gap: 16px; }
    .integrity .kpi-icon { width: 48px; height: 48px; border-radius: 16px; }
    .hash { max-width: 120px; overflow: hidden; color: var(--ink-400); text-overflow: ellipsis; white-space: nowrap; }
    .details { max-width: 300px; color: var(--ink-500); font-size: 12.5px; }
  `]
})
export class AuditComponent {
  result: AuditResult | 'tous' = 'tous';
  ressource = 'toutes';
  search = '';
  limit = 60;
  integrity: { ok: boolean; brokenAt?: number; checkedAt: Date } | null = null;

  constructor(readonly auth: AuthService, private readonly store: StoreService) {}

  get technical(): boolean {
    return this.auth.can('journaux:technique');
  }

  /** Le Manager dispose d'une synthèse : événements de sécurité et opérations sensibles uniquement. */
  get scoped(): AuditLog[] {
    const all = this.store.state.audit;
    return this.technical ? all : all.filter((log) => log.resultat !== 'succes' || SENSITIVE_RESOURCES.includes(log.ressource) || /validation|rôle|compte|annulation/i.test(log.action));
  }

  get logs(): AuditLog[] {
    const query = this.search.trim().toLowerCase();
    return [...this.scoped].reverse().filter((log) =>
      (this.result === 'tous' || log.resultat === this.result) &&
      (this.ressource === 'toutes' || log.ressource === this.ressource) &&
      (!query || `${log.identifiant} ${log.action} ${log.objet || ''} ${log.motif || ''} ${log.details || ''}`.toLowerCase().includes(query))
    );
  }

  get ressources(): string[] {
    return Array.from(new Set(this.scoped.map((log) => log.ressource))).sort();
  }

  get stats(): { total: number; echecs: number; refus: number; connexions: number } {
    const week = Date.now() - 7 * 86400000;
    const recent = this.scoped.filter((log) => new Date(log.date).getTime() > week);
    return {
      total: recent.length,
      echecs: recent.filter((log) => log.resultat === 'echec').length,
      refus: recent.filter((log) => log.resultat === 'refus').length,
      connexions: recent.filter((log) => log.action === 'Connexion').length
    };
  }

  badge(result: AuditResult): string {
    return result === 'succes' ? 'badge--success' : result === 'echec' ? 'badge--warning' : 'badge--danger';
  }

  label(result: AuditResult): string {
    return result === 'succes' ? 'Succès' : result === 'echec' ? 'Échec' : 'Refusé';
  }

  verify(): void {
    this.integrity = { ...this.store.verifyAuditChain(), checkedAt: new Date() };
    this.auth.trace('Vérification d’intégrité du journal', 'Journaux', this.integrity.ok ? 'succes' : 'echec', {
      details: this.integrity.ok ? `${this.store.state.audit.length} traces conformes` : `Rupture à la trace n°${this.integrity.brokenAt}`
    });
  }

  export(): void {
    if (!this.auth.require('journaux:technique', 'Journaux', 'export du journal')) {
      return;
    }
    const rows = [['N°', 'Date', 'Compte', 'Rôle', 'Action', 'Ressource', 'Objet', 'Résultat', 'Motif', 'Détails', 'Empreinte']];
    this.logs.forEach((log) => rows.push([String(log.seq), log.date, log.identifiant, log.role || '', log.action, log.ressource, log.objet || '', log.resultat, log.motif || '', log.details || '', log.hash]));
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `tammak-journal-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    this.auth.trace('Export du journal d’audit', 'Journaux', 'succes', { details: `${this.logs.length} traces` });
  }
}
