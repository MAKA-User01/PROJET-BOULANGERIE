import { Component } from '@angular/core';
import { AdminService } from '../../core/admin.service';
import { AuthService } from '../../core/auth.service';
import { FinanceService } from '../../core/finance.service';
import { Budget, PaymentRequest, PurchaseOrder, Sale, Settings, StockMovement } from '../../core/models';
import { PurchaseService } from '../../core/purchase.service';
import { SalesService } from '../../core/sales.service';
import { MOVEMENT_LABELS, StockService } from '../../core/stock.service';
import { StoreService } from '../../core/store.service';

interface Rejection {
  title: string;
  reference: string;
  run: (motif: string) => void;
}

@Component({
  selector: 'tm-validations',
  templateUrl: './validations.component.html',
  styles: [`
    .queue { display: flex; flex-direction: column; }
    .queue-item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 16px; padding: 18px 22px; border-top: 1px solid var(--line-soft); }
    .queue-item:first-child { border-top: 0; }
    .queue-body strong { display: block; font-size: 14.5px; }
    .queue-body p { margin-top: 3px; color: var(--ink-500); font-size: 13px; }
    .queue-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 8px; color: var(--ink-400); font-size: 12px; font-weight: 600; }
    .queue-actions { display: flex; gap: 8px; }
    .queue-amount { font-family: var(--font-display); font-size: 20px; font-weight: 600; }
    .section-head { display: flex; align-items: center; gap: 10px; }
    .count { min-width: 24px; height: 24px; display: inline-grid; place-items: center; padding: 0 7px; border-radius: 99px; background: var(--crust-500); color: #fff; font-size: 12px; font-weight: 800; }
    .count--zero { background: var(--flour-deep); color: var(--ink-400); }
    .all-clear { display: flex; align-items: center; gap: 14px; padding: 22px; }
    .all-clear .kpi-icon { width: 48px; height: 48px; border-radius: 16px; }
    @media (max-width: 760px) { .queue-item { grid-template-columns: 1fr; } .queue-item > .kpi-icon { display: none; } }
  `]
})
export class ValidationsComponent {
  rejection: Rejection | null = null;
  motif = '';
  rules: Pick<Settings, 'separationTaches' | 'seuilAchat' | 'seuilPaiement' | 'seuilEcartStock' | 'remiseMaxPct'>;

  constructor(
    readonly auth: AuthService,
    private readonly store: StoreService,
    private readonly purchases: PurchaseService,
    private readonly stock: StockService,
    private readonly finance: FinanceService,
    private readonly sales: SalesService,
    private readonly admin: AdminService
  ) {
    const settings = this.store.state.settings;
    this.rules = {
      separationTaches: settings.separationTaches, seuilAchat: settings.seuilAchat, seuilPaiement: settings.seuilPaiement,
      seuilEcartStock: settings.seuilEcartStock, remiseMaxPct: settings.remiseMaxPct
    };
  }

  get orders(): PurchaseOrder[] {
    return this.auth.can('achats:valider') ? this.store.state.orders.filter((order) => order.statut === 'en_validation') : [];
  }

  get movements(): StockMovement[] {
    return this.auth.can('stocks:valider') ? this.stock.pendingMovements : [];
  }

  get requests(): PaymentRequest[] {
    return this.auth.can('tresorerie:valider') ? this.store.state.paymentRequests.filter((request) => request.statut === 'en_validation') : [];
  }

  get budgets(): Budget[] {
    return this.auth.can('tresorerie:valider') ? this.store.state.budgets.filter((budget) => budget.statut === 'propose') : [];
  }

  get cancellations(): Sale[] {
    return this.auth.can('ventes:superviser') ? this.store.state.sales.filter((sale) => sale.statut === 'annulation_demandee') : [];
  }

  get total(): number {
    return this.orders.length + this.movements.length + this.requests.length + this.budgets.length + this.cancellations.length;
  }

  supplierName(order: PurchaseOrder): string {
    return this.purchases.supplier(order.fournisseurId)?.nom || 'Fournisseur';
  }

  productName(movement: StockMovement): string {
    const product = this.stock.product(movement.productId);
    return product ? `${product.libelle} (${product.reference})` : 'Produit';
  }

  unit(movement: StockMovement): string {
    return this.stock.product(movement.productId)?.unite || '';
  }

  movementLabel(movement: StockMovement): string {
    return MOVEMENT_LABELS[movement.type];
  }

  approveOrder(order: PurchaseOrder): void { this.purchases.decide(order, true); }
  approveMovement(movement: StockMovement): void { this.stock.decide(movement, true); }
  approveRequest(request: PaymentRequest): void { this.finance.decide(request, true); }
  approveBudget(budget: Budget): void { this.finance.validateBudget(budget); }
  decideSale(sale: Sale, approve: boolean): void { this.sales.decideCancellation(sale, approve); }

  rejectOrder(order: PurchaseOrder): void {
    this.askRejection('Rejeter la commande', order.numero, (motif) => this.purchases.decide(order, false, motif));
  }

  rejectMovement(movement: StockMovement): void {
    this.askRejection('Refuser l’ajustement', this.productName(movement), (motif) => this.stock.decide(movement, false, motif));
  }

  rejectRequest(request: PaymentRequest): void {
    this.askRejection('Rejeter le paiement', request.numero, (motif) => this.finance.decide(request, false, motif));
  }

  confirmRejection(): void {
    if (this.rejection && this.motif.trim()) {
      this.rejection.run(this.motif.trim());
      this.rejection = null;
    }
  }

  saveRules(): void {
    this.admin.updateRules({
      separationTaches: this.rules.separationTaches,
      seuilAchat: Number(this.rules.seuilAchat),
      seuilPaiement: Number(this.rules.seuilPaiement),
      seuilEcartStock: Number(this.rules.seuilEcartStock),
      remiseMaxPct: Number(this.rules.remiseMaxPct)
    });
  }

  private askRejection(title: string, reference: string, run: (motif: string) => void): void {
    this.motif = '';
    this.rejection = { title, reference, run };
  }
}
