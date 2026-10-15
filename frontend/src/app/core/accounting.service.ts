import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { EntryLine, JournalCode, JournalEntry } from './models';
import { StoreService } from './store.service';
import { ToastService } from './toast.service';

/** Extrait du plan comptable SYSCOHADA révisé utilisé par la boulangerie. */
export const CHART_OF_ACCOUNTS: { [compte: string]: string } = {
  '101': 'Capital social',
  '401': 'Fournisseurs',
  '411': 'Clients',
  '421': 'Personnel — rémunérations dues',
  '521': 'Banque',
  '5211': 'MTN Mobile Money',
  '5212': 'Orange Money',
  '571': 'Caisse',
  '585': 'Virements de fonds',
  '601': 'Achats de matières premières',
  '604': 'Achats stockés de matières et fournitures',
  '605': 'Autres achats (énergie, eau)',
  '608': 'Achats d’emballages',
  '622': 'Locations et charges locatives',
  '624': 'Entretien, réparations et maintenance',
  '627': 'Publicité et relations publiques',
  '658': 'Charges diverses',
  '661': 'Rémunérations du personnel',
  '658-1': 'Écarts de caisse (pertes)',
  '702': 'Ventes de produits finis',
  '758': 'Produits divers'
};

export const JOURNALS: { code: JournalCode; label: string }[] = [
  { code: 'VE', label: 'Ventes' },
  { code: 'AC', label: 'Achats' },
  { code: 'BQ', label: 'Banque & mobile money' },
  { code: 'CA', label: 'Caisse' },
  { code: 'OD', label: 'Opérations diverses' }
];

export const CATEGORY_ACCOUNTS: { [categorie: string]: string } = {
  'Matières premières': '601',
  'Énergie': '605',
  'Salaires': '661',
  'Loyer': '622',
  'Entretien': '624',
  'Emballages': '608',
  'Marketing': '627',
  'Divers': '658',
  'Dépôt des recettes': '585'
};

@Injectable({ providedIn: 'root' })
export class AccountingService {
  constructor(private readonly store: StoreService, private readonly auth: AuthService, private readonly toast: ToastService) {}

  get entries(): JournalEntry[] {
    return [...this.store.state.entries].sort((a, b) => b.date.localeCompare(a.date));
  }

  /** Écriture générée automatiquement par un autre module (brouillon à contrôler par le Comptable). */
  generate(journal: JournalCode, libelle: string, lignes: EntryLine[], source: string): void {
    const numero = `EC-${String(this.store.nextNumber('ecriture')).padStart(5, '0')}`;
    this.store.commit((db) => {
      db.entries.push({
        id: this.store.uid('e'), numero, date: new Date().toISOString(), journal, libelle, lignes,
        statut: 'brouillon', auteurId: this.auth.user?.id || 'systeme', source
      });
    });
  }

  validateLines(lignes: EntryLine[]): string | null {
    const filled = lignes.filter((line) => line.compte && (line.debit > 0 || line.credit > 0));
    if (filled.length < 2) {
      return 'Une écriture comporte au moins deux lignes.';
    }
    if (filled.some((line) => line.debit > 0 && line.credit > 0)) {
      return 'Une ligne ne peut pas être à la fois au débit et au crédit.';
    }
    if (filled.some((line) => !CHART_OF_ACCOUNTS[line.compte])) {
      return 'Un compte ne figure pas au plan comptable.';
    }
    const debit = filled.reduce((sum, line) => sum + line.debit, 0);
    const credit = filled.reduce((sum, line) => sum + line.credit, 0);
    if (Math.round(debit) !== Math.round(credit)) {
      return `L’écriture n’est pas équilibrée (écart de ${Math.abs(debit - credit)} FCFA).`;
    }
    return null;
  }

  save(draft: { id?: string; date: string; journal: JournalCode; libelle: string; lignes: EntryLine[] }): boolean {
    if (!this.auth.require('compta:saisir', 'Comptabilité', 'saisie d’écriture')) {
      return false;
    }
    const error = this.validateLines(draft.lignes) || (!draft.libelle.trim() ? 'Le libellé est obligatoire.' : null);
    if (error) {
      this.toast.error('Écriture refusée', error);
      return false;
    }
    const lignes = draft.lignes
      .filter((line) => line.compte && (line.debit > 0 || line.credit > 0))
      .map((line) => ({ ...line, libelle: line.libelle || CHART_OF_ACCOUNTS[line.compte] }));
    if (draft.id) {
      const existing = this.store.state.entries.find((entry) => entry.id === draft.id);
      if (!existing || existing.statut !== 'brouillon') {
        this.toast.error('Modification impossible', 'Une écriture validée ne se modifie pas : passez une contre-passation.');
        return false;
      }
      this.store.commit(() => Object.assign(existing, { date: draft.date, journal: draft.journal, libelle: draft.libelle.trim(), lignes }));
      this.auth.trace('Modification d’écriture', 'Comptabilité', 'succes', { objet: existing.numero });
      this.toast.success('Écriture mise à jour', existing.numero);
      return true;
    }
    const numero = `EC-${String(this.store.nextNumber('ecriture')).padStart(5, '0')}`;
    this.store.commit((db) => {
      db.entries.push({
        id: this.store.uid('e'), numero, date: draft.date, journal: draft.journal, libelle: draft.libelle.trim(),
        lignes, statut: 'brouillon', auteurId: this.auth.user!.id, source: 'Saisie manuelle'
      });
    });
    this.auth.trace('Saisie d’écriture', 'Comptabilité', 'succes', { objet: numero });
    this.toast.success('Écriture enregistrée en brouillon', numero);
    return true;
  }

  validate(entry: JournalEntry): void {
    if (!this.auth.require('compta:controler', 'Comptabilité', 'validation d’écriture')) {
      return;
    }
    const error = this.validateLines(entry.lignes);
    if (error) {
      this.toast.error('Contrôle échoué', error);
      this.auth.trace('Contrôle d’écriture', 'Comptabilité', 'echec', { objet: entry.numero, motif: error });
      return;
    }
    this.store.commit(() => {
      entry.statut = 'validee';
      entry.controlePar = this.auth.user!.id;
    });
    this.auth.trace('Validation d’écriture', 'Comptabilité', 'succes', { objet: entry.numero });
    this.toast.success('Écriture contrôlée et validée', entry.numero);
  }

  reverse(entry: JournalEntry): void {
    if (!this.auth.require('compta:saisir', 'Comptabilité', 'contre-passation')) {
      return;
    }
    if (entry.statut !== 'validee') {
      return;
    }
    const numero = `EC-${String(this.store.nextNumber('ecriture')).padStart(5, '0')}`;
    this.store.commit((db) => {
      db.entries.push({
        id: this.store.uid('e'), numero, date: new Date().toISOString(), journal: entry.journal,
        libelle: `Contre-passation de ${entry.numero} — ${entry.libelle}`,
        lignes: entry.lignes.map((line) => ({ ...line, debit: line.credit, credit: line.debit })),
        statut: 'brouillon', auteurId: this.auth.user!.id, source: 'Correction après validation', contrepassationDe: entry.id
      });
    });
    this.auth.trace('Contre-passation d’écriture', 'Comptabilité', 'succes', { objet: entry.numero, details: `Nouvelle écriture ${numero}` });
    this.toast.success('Contre-passation créée', `${numero} est à contrôler.`);
  }

  balance(includeDrafts: boolean): { compte: string; libelle: string; debit: number; credit: number; solde: number }[] {
    const totals = new Map<string, { debit: number; credit: number }>();
    this.store.state.entries
      .filter((entry) => includeDrafts || entry.statut === 'validee')
      .forEach((entry) => entry.lignes.forEach((line) => {
        const current = totals.get(line.compte) || { debit: 0, credit: 0 };
        current.debit += line.debit;
        current.credit += line.credit;
        totals.set(line.compte, current);
      }));
    return Array.from(totals.entries())
      .map(([compte, total]) => ({ compte, libelle: CHART_OF_ACCOUNTS[compte] || compte, ...total, solde: total.debit - total.credit }))
      .sort((a, b) => a.compte.localeCompare(b.compte));
  }

  exportCsv(entries: JournalEntry[], label: string): void {
    if (!this.auth.require('compta:lire', 'Comptabilité', 'export')) {
      return;
    }
    const rows = [['Numéro', 'Date', 'Journal', 'Libellé', 'Compte', 'Intitulé', 'Débit', 'Crédit', 'Statut']];
    entries.forEach((entry) => entry.lignes.forEach((line) => rows.push([
      entry.numero, new Date(entry.date).toLocaleDateString('fr-FR'), entry.journal, entry.libelle, line.compte,
      line.libelle, String(line.debit), String(line.credit), entry.statut
    ])));
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tammak-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    this.auth.trace('Export comptable', 'Comptabilité', 'succes', { objet: label, details: `${entries.length} écriture(s)` });
  }
}
