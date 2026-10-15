import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { sha256 } from './crypto';
import { AuditLog, DbState } from './models';
import { createSeed } from './seed';

const STORAGE_KEY = 'tammak.db.v2';
const GENESIS = '0'.repeat(64);

/**
 * Couche de persistance locale.
 * Simule le serveur applicatif : toutes les écritures passent par les services métier,
 * qui contrôlent les permissions avant d'appeler `commit`.
 */
@Injectable({ providedIn: 'root' })
export class StoreService {
  readonly changes$ = new Subject<void>();
  private db: DbState;

  constructor() {
    this.db = this.load();
  }

  get state(): Readonly<DbState> {
    return this.db;
  }

  commit(mutation: (db: DbState) => void): void {
    mutation(this.db);
    this.persist();
    this.changes$.next();
  }

  nextNumber(counter: string): number {
    this.db.counters[counter] = (this.db.counters[counter] || 0) + 1;
    return this.db.counters[counter];
  }

  uid(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  /** Ajout en fin de journal uniquement : aucune méthode ne permet de modifier ou supprimer une trace. */
  appendAudit(entry: Omit<AuditLog, 'seq' | 'hash' | 'prevHash' | 'date'> & { date?: string }): void {
    const previous = this.db.audit[this.db.audit.length - 1];
    const record: AuditLog = {
      ...entry,
      date: entry.date || new Date().toISOString(),
      seq: previous ? previous.seq + 1 : 1,
      prevHash: previous ? previous.hash : GENESIS,
      hash: ''
    };
    record.hash = sha256(StoreService.auditPayload(record));
    this.db.audit.push(record);
    this.persist();
    this.changes$.next();
  }

  verifyAuditChain(): { ok: boolean; brokenAt?: number } {
    let previousHash = GENESIS;
    for (const record of this.db.audit) {
      if (record.prevHash !== previousHash || sha256(StoreService.auditPayload(record)) !== record.hash) {
        return { ok: false, brokenAt: record.seq };
      }
      previousHash = record.hash;
    }
    return { ok: true };
  }

  /** Remplace les données métier par celles d'une sauvegarde. Le journal d'audit est conservé intégralement. */
  restoreBusinessData(snapshot: DbState): void {
    const audit = this.db.audit;
    const backups = this.db.backups;
    this.db = { ...snapshot, audit, backups };
    this.persist();
    this.changes$.next();
  }

  snapshot(): string {
    const { audit, backups, ...business } = this.db;
    return JSON.stringify(business);
  }

  resetDemo(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.db = this.seed();
  }

  static auditPayload(record: AuditLog): string {
    return [
      record.seq, record.date, record.userId || '', record.identifiant, record.role || '', record.action,
      record.ressource, record.objet || '', record.resultat, record.motif || '', record.details || '', record.prevHash
    ].join('|');
  }

  private load(): DbState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DbState;
        if (parsed.version === 1) {
          return parsed;
        }
      }
    } catch {
      // Stockage indisponible ou corrompu : on repart d'une base propre.
    }
    return this.seed();
  }

  private seed(): DbState {
    this.db = createSeed();
    const day = (offset: number, hour: number) => {
      const date = new Date();
      date.setDate(date.getDate() - offset);
      date.setHours(hour, 12, 0, 0);
      return date.toISOString();
    };
    const history: [number, number, string, string, string, string, string, 'succes' | 'echec' | 'refus', string?][] = [
      [3, 7, 'u-rnkoulou', 'r.nkoulou', 'admin', 'Initialisation de la base', 'Système', 'succes'],
      [2, 6, 'u-cekambi', 'c.ekambi', 'caissier', 'Connexion', 'Session', 'succes'],
      [2, 9, '', 'c.ekambi', '', 'Échec de connexion', 'Session', 'echec', 'Mot de passe incorrect'],
      [1, 6, 'u-jndjock', 'j.ndjock', 'caissier', 'Connexion', 'Session', 'succes'],
      [1, 8, 'u-embarga', 'e.mbarga', 'manager', 'Validation de commande', 'Achats', 'succes'],
      [1, 15, 'u-cekambi', 'c.ekambi', 'caissier', 'Tentative d’accès non autorisé', 'Utilisateurs & rôles', 'refus', 'Permission utilisateurs:gerer absente'],
      [0, 6, 'u-jndjock', 'j.ndjock', 'caissier', 'Ouverture de caisse', 'Caisse', 'succes'],
      [0, 7, 'u-htchoupo', 'h.tchoupo', 'stock', 'Déclaration de perte (validation requise)', 'Stocks', 'succes', 'Fournée trop cuite']
    ];
    history.forEach(([offset, hour, userId, identifiant, role, action, ressource, resultat, motif]) => {
      this.appendAudit({
        date: day(offset, hour),
        userId: userId || undefined,
        identifiant,
        role: (role || undefined) as AuditLog['role'],
        action,
        ressource,
        resultat,
        motif
      });
    });
    this.persist();
    return this.db;
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
    } catch {
      // Quota dépassé : les données restent en mémoire pour la session.
    }
  }
}
