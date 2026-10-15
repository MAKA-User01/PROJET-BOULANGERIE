import { Component } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { EXPENSE_CATEGORIES, FinanceService, REQUEST_STATUS_LABELS } from '../../core/finance.service';
import { Budget, PaymentRequest, PaymentRequestStatus, PurchaseOrder, TreasuryMovement } from '../../core/models';
import { PurchaseService } from '../../core/purchase.service';
import { StoreService } from '../../core/store.service';

@Component({
  selector: 'tm-treasury',
  templateUrl: './treasury.component.html',
  styles: [`
    .accounts { display: grid; grid-template-columns: 1.3fr repeat(4, minmax(0, 1fr)); gap: 14px; }
    .total-card .kpi-value { color: #fff4e3; font-size: 34px; }
    .total-card .kpi-label { color: #cbb8a6; }
    .total-card .kpi-foot { color: #a8968a; }
    .account-card { display: flex; flex-direction: column; gap: 14px; }
    .account-card strong.num { font-family: var(--font-display); font-size: 21px; }
    .budget-row { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 2fr) auto; align-items: center; gap: 18px; padding: 16px 22px; border-top: 1px solid var(--line-soft); }
    .budget-row:first-child { border-top: 0; }
    .budget-meta { display: flex; justify-content: space-between; margin-top: 6px; color: var(--ink-500); font-size: 12px; }
    .over { color: var(--danger-500); font-weight: 700; }
    @media (max-width: 1180px) { .accounts { grid-template-columns: repeat(2, minmax(0, 1fr)); } .total-card { grid-column: 1 / -1; } }
    @media (max-width: 640px) { .accounts { grid-template-columns: 1fr; } .budget-row { grid-template-columns: 1fr; } }
  `]
})
export class TreasuryComponent {
  tab: 'mouvements' | 'paiements' | 'budgets' = 'mouvements';
  movementForm: { compteId: string; sens: 'entree' | 'sortie'; montant: number | null; categorie: string; libelle: string } | null = null;
  requestForm: { beneficiaire: string; objet: string; montant: number | null; categorie: string; compteId: string; commandeId: string } | null = null;
  budgetForm: { categorie: string; periode: string; montant: number | null } | null = null;
  readonly categories = EXPENSE_CATEGORIES;
  readonly statusLabels = REQUEST_STATUS_LABELS;

  constructor(readonly auth: AuthService, readonly finance: FinanceService, private readonly purchases: PurchaseService, readonly store: StoreService) {}

  get movements(): TreasuryMovement[] {
    return this.finance.movements.slice(0, 60);
  }

  get unpaidOrders(): PurchaseOrder[] {
    const requested = new Set(this.store.state.paymentRequests.filter((request) => request.statut !== 'rejetee').map((request) => request.commandeId));
    return this.store.state.orders.filter((order) => order.statut === 'livree' && !order.regle && !requested.has(order.id));
  }

  get monthBudgets(): Budget[] {
    const periode = new Date().toISOString().slice(0, 7);
    return this.finance.budgets.filter((budget) => budget.periode === periode);
  }

  get monthFlows(): { entrees: number; sorties: number } {
    const periode = new Date().toISOString().slice(0, 7);
    const month = this.store.state.treasury.filter((movement) => movement.date.startsWith(periode));
    return {
      entrees: month.filter((movement) => movement.sens === 'entree').reduce((sum, movement) => sum + movement.montant, 0),
      sorties: month.filter((movement) => movement.sens === 'sortie').reduce((sum, movement) => sum + movement.montant, 0)
    };
  }

  accountName(id: string): string {
    return this.finance.account(id)?.libelle || '—';
  }

  supplierName(order: PurchaseOrder): string {
    return this.purchases.supplier(order.fournisseurId)?.nom || '';
  }

  badge(status: PaymentRequestStatus): string {
    return { en_validation: 'badge--warning', approuvee: 'badge--info', rejetee: 'badge--danger', payee: 'badge--success' }[status];
  }

  usage(budget: Budget): number {
    return (this.finance.spent(budget) / budget.montantPrevu) * 100;
  }

  newMovement(): void {
    this.movementForm = { compteId: 't-banque', sens: 'sortie', montant: null, categorie: 'Divers', libelle: '' };
  }

  saveMovement(): void {
    const form = this.movementForm;
    if (form && this.finance.recordMovement({ ...form, montant: Number(form.montant) })) {
      this.movementForm = null;
    }
  }

  newRequest(order?: PurchaseOrder): void {
    this.tab = 'paiements';
    this.requestForm = order
      ? { beneficiaire: this.supplierName(order), objet: `Règlement ${order.numero}`, montant: order.total, categorie: 'Matières premières', compteId: 't-banque', commandeId: order.id }
      : { beneficiaire: '', objet: '', montant: null, categorie: 'Divers', compteId: 't-banque', commandeId: '' };
  }

  linkOrder(orderId: string): void {
    const order = this.unpaidOrders.find((candidate) => candidate.id === orderId);
    if (order && this.requestForm) {
      this.requestForm = { ...this.requestForm, beneficiaire: this.supplierName(order), objet: `Règlement ${order.numero}`, montant: order.total, categorie: 'Matières premières', commandeId: order.id };
    }
  }

  saveRequest(): void {
    const form = this.requestForm;
    if (form && this.finance.createRequest({ ...form, montant: Number(form.montant), commandeId: form.commandeId || undefined })) {
      this.requestForm = null;
    }
  }

  pay(request: PaymentRequest): void {
    this.finance.pay(request);
  }

  approve(request: PaymentRequest): void {
    this.finance.decide(request, true);
  }

  newBudget(): void {
    this.tab = 'budgets';
    this.budgetForm = { categorie: this.categories[0], periode: new Date().toISOString().slice(0, 7), montant: null };
  }

  saveBudget(): void {
    const form = this.budgetForm;
    if (form && this.finance.proposeBudget(form.categorie, form.periode, Number(form.montant))) {
      this.budgetForm = null;
    }
  }
}
