import { Component } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { OrderLine, OrderStatus, Product, PurchaseOrder, Supplier } from '../../core/models';
import { ORDER_STATUS_LABELS, PurchaseService } from '../../core/purchase.service';
import { StoreService } from '../../core/store.service';

interface OrderDraft {
  id?: string;
  fournisseurId: string;
  livraisonPrevue: string;
  lignes: OrderLine[];
}

@Component({
  selector: 'tm-purchases',
  templateUrl: './purchases.component.html',
  styles: [`
    .line-editor { display: flex; flex-direction: column; gap: 8px; }
    .line-row { display: grid; grid-template-columns: minmax(0, 2fr) 90px 120px 110px 36px; align-items: center; gap: 8px; }
    .line-row.head { color: var(--ink-400); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .order-total { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-radius: 14px; background: var(--flour); }
    .order-total strong { font-family: var(--font-display); font-size: 24px; }
    .timeline { position: relative; display: flex; flex-direction: column; gap: 16px; margin: 6px 0 0; padding-left: 26px; }
    .timeline::before { content: ''; position: absolute; top: 6px; bottom: 6px; left: 7px; width: 2px; background: var(--line); }
    .timeline li { position: relative; list-style: none; font-size: 13.5px; }
    .timeline li::before { content: ''; position: absolute; top: 4px; left: -24px; width: 12px; height: 12px; border: 2px solid var(--surface); border-radius: 50%; background: var(--ink-300); box-shadow: 0 0 0 2px var(--line); }
    .timeline li.done::before { background: var(--okok-500); box-shadow: 0 0 0 2px var(--okok-50); }
    .timeline li.bad::before { background: var(--danger-500); }
    .timeline small { display: block; color: var(--ink-400); }
    .supplier-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
    .supplier-card { display: flex; flex-direction: column; gap: 10px; }
    .supplier-card .contact { display: flex; flex-direction: column; gap: 6px; color: var(--ink-500); font-size: 13px; }
    .supplier-card .contact span { display: flex; align-items: center; gap: 8px; }
    .supplier-card .icon { width: 15px; height: 15px; color: var(--ink-400); }
    @media (max-width: 640px) { .line-row { grid-template-columns: 1fr 1fr; } .line-row.head { display: none; } }
  `]
})
export class PurchasesComponent {
  tab: 'commandes' | 'fournisseurs' = 'commandes';
  status: OrderStatus | 'toutes' = 'toutes';
  draft: OrderDraft | null = null;
  selected: PurchaseOrder | null = null;
  supplierDraft: (Omit<Supplier, 'id'> & { id?: string }) | null = null;
  motifRejet = '';
  readonly statusLabels = ORDER_STATUS_LABELS;

  constructor(readonly auth: AuthService, readonly purchases: PurchaseService, private readonly store: StoreService) {
    if (!this.canSeeOrders) {
      this.tab = 'fournisseurs';
    }
  }

  get canSeeOrders(): boolean {
    return this.auth.canAny(['achats:lire', 'achats:preparer', 'achats:valider']);
  }

  get orders(): PurchaseOrder[] {
    return this.purchases.orders.filter((order) => this.status === 'toutes' || order.statut === this.status);
  }

  get products(): Product[] {
    return this.store.state.products.filter((product) => product.actif && product.type === 'matiere');
  }

  get draftTotal(): number {
    return this.draft ? this.draft.lignes.reduce((sum, line) => sum + (Number(line.quantite) || 0) * (Number(line.prixUnitaire) || 0), 0) : 0;
  }

  get threshold(): number {
    return this.store.state.settings.seuilAchat;
  }

  supplierName(id: string): string {
    return this.purchases.supplier(id)?.nom || '—';
  }

  supplierOrders(supplier: Supplier): number {
    return this.store.state.orders.filter((order) => order.fournisseurId === supplier.id).length;
  }

  badge(status: OrderStatus): string {
    return { brouillon: '', en_validation: 'badge--warning', approuvee: 'badge--info', rejetee: 'badge--danger', livree: 'badge--success', annulee: 'badge--danger' }[status];
  }

  newOrder(): void {
    this.draft = { fournisseurId: this.purchases.suppliers[0]?.id || '', livraisonPrevue: '', lignes: [this.emptyLine()] };
  }

  editOrder(order: PurchaseOrder): void {
    this.selected = null;
    this.draft = { id: order.id, fournisseurId: order.fournisseurId, livraisonPrevue: order.livraisonPrevue?.slice(0, 10) || '', lignes: order.lignes.map((line) => ({ ...line })) };
  }

  addLine(): void {
    this.draft?.lignes.push(this.emptyLine());
  }

  removeLine(index: number): void {
    this.draft?.lignes.splice(index, 1);
  }

  onProduct(line: OrderLine): void {
    const product = this.products.find((candidate) => candidate.id === line.productId);
    if (product) {
      line.libelle = product.libelle;
      line.prixUnitaire = product.prix;
    }
  }

  saveOrder(submit: boolean): void {
    if (!this.draft) {
      return;
    }
    const lignes = this.draft.lignes.map((line) => ({ ...line, quantite: Number(line.quantite), prixUnitaire: Number(line.prixUnitaire) }));
    const ok = this.purchases.saveOrder({
      id: this.draft.id, fournisseurId: this.draft.fournisseurId,
      livraisonPrevue: this.draft.livraisonPrevue ? new Date(this.draft.livraisonPrevue).toISOString() : undefined, lignes
    }, submit);
    if (ok) {
      this.draft = null;
    }
  }

  open(order: PurchaseOrder): void {
    this.selected = order;
    this.motifRejet = '';
  }

  act(action: 'submit' | 'receive' | 'cancel' | 'approve' | 'reject'): void {
    const order = this.selected;
    if (!order) {
      return;
    }
    if (action === 'submit') { this.purchases.submit(order); }
    if (action === 'receive') { this.purchases.receive(order); }
    if (action === 'cancel') { this.purchases.cancel(order); }
    if (action === 'approve') { this.purchases.decide(order, true); }
    if (action === 'reject') {
      this.purchases.decide(order, false, this.motifRejet);
      if (order.statut === 'en_validation') {
        return;
      }
    }
    this.selected = null;
  }

  editSupplier(supplier?: Supplier): void {
    this.supplierDraft = supplier ? { ...supplier } : { nom: '', contact: '', telephone: '', email: '', categorie: 'Farines', actif: true };
  }

  saveSupplier(): void {
    if (this.supplierDraft && this.purchases.saveSupplier(this.supplierDraft)) {
      this.supplierDraft = null;
    }
  }

  private emptyLine(): OrderLine {
    const product = this.products[0];
    return { productId: product?.id || '', libelle: product?.libelle || '', quantite: 1, prixUnitaire: product?.prix || 0 };
  }
}
