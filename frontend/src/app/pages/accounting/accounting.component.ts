import { Component } from '@angular/core';
import { AccountingService, CHART_OF_ACCOUNTS, JOURNALS } from '../../core/accounting.service';
import { AuthService } from '../../core/auth.service';
import { EntryLine, JournalCode, JournalEntry } from '../../core/models';

interface EntryDraft {
  id?: string;
  date: string;
  journal: JournalCode;
  libelle: string;
  lignes: EntryLine[];
}

@Component({
  selector: 'tm-accounting',
  templateUrl: './accounting.component.html',
  styles: [`
    .entry-lines { margin: 0; padding: 0; }
    .entry-lines td { padding: 8px 16px; background: var(--flour); font-size: 13px; }
    .line-row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1.6fr) 120px 120px 36px; align-items: center; gap: 8px; }
    .line-row.head { color: var(--ink-400); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .balance-check { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-radius: 14px; background: var(--flour); font-size: 13.5px; }
    .balance-check.ok { background: var(--okok-50); color: var(--okok-700); }
    .balance-check.ko { background: var(--danger-50); color: var(--danger-500); }
    .statement { display: flex; flex-direction: column; }
    .statement-row { display: flex; justify-content: space-between; padding: 11px 0; border-top: 1px solid var(--line-soft); font-size: 14px; }
    .statement-row.total { border-top: 2px solid var(--ink-900); font-weight: 800; }
    .result { font-family: var(--font-display); font-size: 34px; font-weight: 600; }
    @media (max-width: 760px) { .line-row { grid-template-columns: 1fr 1fr; } .line-row.head { display: none; } }
  `]
})
export class AccountingComponent {
  tab: 'ecritures' | 'balance' | 'etats' = 'ecritures';
  journal: JournalCode | 'tous' = 'tous';
  status: 'tous' | 'brouillon' | 'validee' = 'tous';
  includeDrafts = false;
  expanded: string | null = null;
  draft: EntryDraft | null = null;
  readonly trackByIndex = (index: number) => index;
  readonly journals = JOURNALS;
  readonly accounts = Object.entries(CHART_OF_ACCOUNTS).map(([compte, libelle]) => ({ compte, libelle }));

  constructor(readonly auth: AuthService, readonly accounting: AccountingService) {}

  get entries(): JournalEntry[] {
    return this.accounting.entries.filter((entry) =>
      (this.journal === 'tous' || entry.journal === this.journal) && (this.status === 'tous' || entry.statut === this.status));
  }

  get drafts(): number {
    return this.accounting.entries.filter((entry) => entry.statut === 'brouillon').length;
  }

  get balance(): { compte: string; libelle: string; debit: number; credit: number; solde: number }[] {
    return this.accounting.balance(this.includeDrafts);
  }

  get balanceTotals(): { debit: number; credit: number } {
    return this.balance.reduce((sum, row) => ({ debit: sum.debit + row.debit, credit: sum.credit + row.credit }), { debit: 0, credit: 0 });
  }

  get statement(): { produits: { label: string; amount: number }[]; charges: { label: string; amount: number }[]; totalProduits: number; totalCharges: number } {
    const rows = this.accounting.balance(this.includeDrafts);
    const produits = rows.filter((row) => row.compte.startsWith('7')).map((row) => ({ label: `${row.compte} · ${row.libelle}`, amount: row.credit - row.debit }));
    const charges = rows.filter((row) => row.compte.startsWith('6')).map((row) => ({ label: `${row.compte} · ${row.libelle}`, amount: row.debit - row.credit }));
    return {
      produits, charges,
      totalProduits: produits.reduce((sum, row) => sum + row.amount, 0),
      totalCharges: charges.reduce((sum, row) => sum + row.amount, 0)
    };
  }

  get draftDebit(): number {
    return this.draft ? this.draft.lignes.reduce((sum, line) => sum + (Number(line.debit) || 0), 0) : 0;
  }

  get draftCredit(): number {
    return this.draft ? this.draft.lignes.reduce((sum, line) => sum + (Number(line.credit) || 0), 0) : 0;
  }

  amount(entry: JournalEntry): number {
    return entry.lignes.reduce((sum, line) => sum + line.debit, 0);
  }

  journalLabel(code: JournalCode): string {
    return this.journals.find((journal) => journal.code === code)?.label || code;
  }

  toggle(entry: JournalEntry): void {
    this.expanded = this.expanded === entry.id ? null : entry.id;
  }

  create(): void {
    this.draft = {
      date: new Date().toISOString().slice(0, 10), journal: 'OD', libelle: '',
      lignes: [{ compte: '', libelle: '', debit: 0, credit: 0 }, { compte: '', libelle: '', debit: 0, credit: 0 }]
    };
  }

  edit(entry: JournalEntry): void {
    this.draft = { id: entry.id, date: entry.date.slice(0, 10), journal: entry.journal, libelle: entry.libelle, lignes: entry.lignes.map((line) => ({ ...line })) };
  }

  addLine(): void {
    this.draft?.lignes.push({ compte: '', libelle: '', debit: 0, credit: 0 });
  }

  removeLine(index: number): void {
    this.draft?.lignes.splice(index, 1);
  }

  save(): void {
    if (!this.draft) {
      return;
    }
    const ok = this.accounting.save({
      ...this.draft,
      date: new Date(this.draft.date).toISOString(),
      lignes: this.draft.lignes.map((line) => ({ ...line, debit: Number(line.debit) || 0, credit: Number(line.credit) || 0 }))
    });
    if (ok) {
      this.draft = null;
    }
  }

  export(): void {
    this.accounting.exportCsv(this.entries, this.journal === 'tous' ? 'journal-general' : `journal-${this.journal}`);
  }
}
