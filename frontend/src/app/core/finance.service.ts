import { Injectable } from '@angular/core';
import { AccountingService, CATEGORY_ACCOUNTS } from './accounting.service';
import { AuthService } from './auth.service';
import { Budget, PaymentRequest, PaymentRequestStatus, TreasuryAccount, TreasuryMovement } from './models';
import { StoreService } from './store.service';
import { ToastService } from './toast.service';

export const EXPENSE_CATEGORIES = ['Matières premières', 'Énergie', 'Salaires', 'Loyer', 'Entretien', 'Emballages', 'Marketing', 'Divers'];

export const REQUEST_STATUS_LABELS: { [status in PaymentRequestStatus]: string } = {
  en_validation: 'En validation',
  approuvee: 'Approuvée',
  rejetee: 'Rejetée',
  payee: 'Payée'
};

@Injectable({ providedIn: 'root' })
export class FinanceService {
  constructor(
    private readonly store: StoreService,
    private readonly auth: AuthService,
    private readonly toast: ToastService,
    private readonly accounting: AccountingService
  ) {}

  get accounts(): TreasuryAccount[] {
    return this.store.state.accounts;
  }

  get totalCash(): number {
    return this.accounts.reduce((sum, account) => sum + account.solde, 0);
  }

  get movements(): TreasuryMovement[] {
    return [...this.store.state.treasury].sort((a, b) => b.date.localeCompare(a.date));
  }

  get requests(): PaymentRequest[] {
    return [...this.store.state.paymentRequests].sort((a, b) => b.creeLe.localeCompare(a.creeLe));
  }

  get budgets(): Budget[] {
    return this.store.state.budgets;
  }

  account(id: string): TreasuryAccount | undefined {
    return this.accounts.find((account) => account.id === id);
  }

  spent(budget: Budget): number {
    return this.store.state.treasury
      .filter((movement) => movement.sens === 'sortie' && movement.categorie === budget.categorie && movement.date.startsWith(budget.periode))
      .reduce((sum, movement) => sum + movement.montant, 0);
  }

  recordMovement(draft: { compteId: string; sens: 'entree' | 'sortie'; montant: number; categorie: string; libelle: string }): boolean {
    if (!this.auth.require('tresorerie:gerer', 'Trésorerie', 'saisie de mouvement')) {
      return false;
    }
    const account = this.account(draft.compteId);
    if (!account || !(draft.montant > 0) || !draft.libelle.trim()) {
      this.toast.error('Mouvement incomplet', 'Compte, montant positif et libellé sont requis.');
      return false;
    }
    if (draft.sens === 'sortie' && account.solde < draft.montant) {
      this.toast.error('Solde insuffisant', `${account.libelle} : ${account.solde.toLocaleString('fr-FR')} FCFA disponibles.`);
      return false;
    }
    this.store.commit((db) => {
      account.solde += draft.sens === 'entree' ? draft.montant : -draft.montant;
      db.treasury.push({
        id: this.store.uid('tm'), date: new Date().toISOString(), compteId: account.id, sens: draft.sens, montant: draft.montant,
        categorie: draft.categorie, libelle: draft.libelle.trim(), auteurId: this.auth.user!.id
      });
    });
    const counterpart = CATEGORY_ACCOUNTS[draft.categorie] || (draft.sens === 'entree' ? '758' : '658');
    this.accounting.generate('BQ', draft.libelle.trim(), draft.sens === 'sortie'
      ? [{ compte: counterpart, libelle: draft.categorie, debit: draft.montant, credit: 0 }, { compte: account.compteComptable, libelle: account.libelle, debit: 0, credit: draft.montant }]
      : [{ compte: account.compteComptable, libelle: account.libelle, debit: draft.montant, credit: 0 }, { compte: counterpart, libelle: draft.categorie, debit: 0, credit: draft.montant }],
    'Trésorerie');
    this.auth.trace(`Mouvement de trésorerie (${draft.sens === 'entree' ? 'entrée' : 'sortie'})`, 'Trésorerie', 'succes', {
      objet: account.libelle, details: `${draft.montant} FCFA · ${draft.categorie}`
    });
    this.toast.success('Mouvement enregistré', `${account.libelle} : ${account.solde.toLocaleString('fr-FR')} FCFA`);
    return true;
  }

  createRequest(draft: { beneficiaire: string; objet: string; montant: number; categorie: string; compteId: string; commandeId?: string }): boolean {
    if (!this.auth.require('tresorerie:gerer', 'Trésorerie', 'demande de paiement')) {
      return false;
    }
    if (!draft.beneficiaire.trim() || !draft.objet.trim() || !(draft.montant > 0)) {
      this.toast.error('Demande incomplète', 'Bénéficiaire, objet et montant sont requis.');
      return false;
    }
    if (draft.commandeId && this.store.state.paymentRequests.some((request) => request.commandeId === draft.commandeId && request.statut !== 'rejetee')) {
      this.toast.error('Doublon', 'Une demande existe déjà pour cette commande.');
      return false;
    }
    const needsApproval = draft.montant >= this.store.state.settings.seuilPaiement;
    const request: PaymentRequest = {
      id: this.store.uid('dp'),
      numero: `DP-${new Date().getFullYear()}-${String(this.store.nextNumber('paiement')).padStart(4, '0')}`,
      ...draft,
      beneficiaire: draft.beneficiaire.trim(),
      objet: draft.objet.trim(),
      statut: needsApproval ? 'en_validation' : 'approuvee',
      creePar: this.auth.user!.id,
      creeLe: new Date().toISOString()
    };
    this.store.commit((db) => db.paymentRequests.push(request));
    this.auth.trace(needsApproval ? 'Demande de paiement soumise à validation' : 'Demande de paiement approuvée (sous le seuil)', 'Trésorerie', 'succes', {
      objet: request.numero, details: `${request.montant} FCFA · ${request.beneficiaire}`
    });
    this.toast.success(needsApproval ? 'Demande transmise au Manager' : 'Demande approuvée', request.numero);
    return true;
  }

  decide(request: PaymentRequest, approve: boolean, motif = ''): void {
    if (!this.auth.require('tresorerie:valider', 'Trésorerie', 'validation de paiement') || request.statut !== 'en_validation') {
      return;
    }
    if (this.store.state.settings.separationTaches && request.creePar === this.auth.user?.id) {
      this.auth.trace('Auto-validation bloquée', 'Trésorerie', 'refus', { objet: request.numero });
      this.toast.error('Séparation des tâches', 'Vous ne pouvez pas valider votre propre demande.');
      return;
    }
    if (!approve && !motif.trim()) {
      this.toast.error('Motif requis', 'Indiquez la raison du rejet.');
      return;
    }
    this.store.commit(() => {
      request.statut = approve ? 'approuvee' : 'rejetee';
      request.validePar = this.auth.user!.id;
      request.motifRejet = approve ? undefined : motif.trim();
    });
    this.auth.trace(approve ? 'Validation de paiement' : 'Rejet de paiement', 'Trésorerie', 'succes', { objet: request.numero, motif: motif || undefined });
    this.toast.success(approve ? 'Paiement autorisé' : 'Paiement rejeté', request.numero);
  }

  pay(request: PaymentRequest): void {
    if (!this.auth.require('tresorerie:gerer', 'Trésorerie', 'exécution de paiement') || request.statut !== 'approuvee') {
      return;
    }
    const account = this.account(request.compteId);
    if (!account || account.solde < request.montant) {
      this.toast.error('Solde insuffisant', 'Choisissez un autre compte ou approvisionnez celui-ci.');
      return;
    }
    const now = new Date().toISOString();
    this.store.commit((db) => {
      account.solde -= request.montant;
      request.statut = 'payee';
      request.payeLe = now;
      db.treasury.push({
        id: this.store.uid('tm'), date: now, compteId: account.id, sens: 'sortie', montant: request.montant,
        categorie: request.categorie, libelle: `${request.objet} — ${request.beneficiaire}`, auteurId: this.auth.user!.id, reference: request.numero
      });
      const order = db.orders.find((candidate) => candidate.id === request.commandeId);
      if (order) {
        order.regle = true;
      }
    });
    const debitAccount = request.commandeId ? '401' : CATEGORY_ACCOUNTS[request.categorie] || '658';
    this.accounting.generate('BQ', `Règlement ${request.beneficiaire} — ${request.numero}`, [
      { compte: debitAccount, libelle: request.commandeId ? 'Fournisseurs' : request.categorie, debit: request.montant, credit: 0 },
      { compte: account.compteComptable, libelle: account.libelle, debit: 0, credit: request.montant }
    ], 'Paiement');
    this.auth.trace('Exécution de paiement', 'Trésorerie', 'succes', { objet: request.numero, details: `${request.montant} FCFA depuis ${account.libelle}` });
    this.toast.success('Paiement effectué', `${request.montant.toLocaleString('fr-FR')} FCFA · ${request.beneficiaire}`);
  }

  proposeBudget(categorie: string, periode: string, montantPrevu: number): boolean {
    if (!this.auth.require('tresorerie:gerer', 'Budgets', 'proposition de budget')) {
      return false;
    }
    if (!(montantPrevu > 0) || !periode) {
      this.toast.error('Budget invalide');
      return false;
    }
    const existing = this.budgets.find((budget) => budget.categorie === categorie && budget.periode === periode);
    if (existing) {
      const before = existing.montantPrevu;
      this.store.commit(() => Object.assign(existing, { montantPrevu, statut: 'propose', validePar: undefined }));
      this.auth.trace('Révision de budget (revalidation requise)', 'Budgets', 'succes', { objet: `${categorie} ${periode}`, details: `${before} → ${montantPrevu} FCFA` });
    } else {
      this.store.commit((db) => db.budgets.push({
        id: this.store.uid('b'), categorie, periode, montantPrevu, statut: 'propose', creePar: this.auth.user!.id
      }));
      this.auth.trace('Proposition de budget', 'Budgets', 'succes', { objet: `${categorie} ${periode}`, details: `${montantPrevu} FCFA` });
    }
    this.toast.success('Budget proposé', 'Il sera effectif après validation du Manager.');
    return true;
  }

  validateBudget(budget: Budget): void {
    if (!this.auth.require('tresorerie:valider', 'Budgets', 'validation de budget') || budget.statut !== 'propose') {
      return;
    }
    this.store.commit(() => {
      budget.statut = 'valide';
      budget.validePar = this.auth.user!.id;
    });
    this.auth.trace('Validation de budget', 'Budgets', 'succes', { objet: `${budget.categorie} ${budget.periode}`, details: `${budget.montantPrevu} FCFA` });
    this.toast.success('Budget validé', budget.categorie);
  }
}
