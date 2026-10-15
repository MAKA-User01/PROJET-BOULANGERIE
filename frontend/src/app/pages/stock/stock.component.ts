import { Component } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { MovementType, Product, StockMovement } from '../../core/models';
import { MOVEMENT_LABELS, StockService } from '../../core/stock.service';
import { StoreService } from '../../core/store.service';

type ManualType = 'entree' | 'sortie' | 'perte' | 'inventaire';

@Component({
  selector: 'tm-stock',
  templateUrl: './stock.component.html',
  styles: [`
    .type-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .type-option { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 12px; border: 1.5px solid var(--line); border-radius: 13px; background: var(--surface); text-align: left; font-size: 13px; font-weight: 700; }
    .type-option small { color: var(--ink-400); font-size: 11.5px; font-weight: 600; }
    .type-option.is-active { border-color: var(--crust-500); background: var(--crust-50); }
    .preview { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-radius: 14px; background: var(--flour); }
    .preview strong { font-family: var(--font-display); font-size: 22px; }
    .delta-pos { color: var(--okok-700); } .delta-neg { color: var(--danger-500); }
    .count-input { width: 110px; }
    @media (max-width: 640px) { .type-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `]
})
export class StockComponent {
  tab: 'etat' | 'mouvements' | 'inventaire' = 'etat';
  search = '';
  filterType: MovementType | 'tous' = 'tous';
  onlyAlerts = false;
  form: { productId: string; type: ManualType; quantite: number | null; motif: string } | null = null;
  counts: { [productId: string]: number | null } = {};
  inventoryMotif = 'Inventaire tournant';
  readonly movementLabels = MOVEMENT_LABELS;
  readonly manualTypes: { id: ManualType; label: string; hint: string }[] = [
    { id: 'entree', label: 'Entrée', hint: 'Production, retour' },
    { id: 'sortie', label: 'Sortie', hint: 'Consommation fournil' },
    { id: 'perte', label: 'Perte', hint: 'Casse, invendus' },
    { id: 'inventaire', label: 'Inventaire', hint: 'Quantité comptée' }
  ];

  constructor(readonly auth: AuthService, readonly stock: StockService, private readonly store: StoreService) {}

  get limited(): boolean {
    return !this.auth.can('stocks:lire') && !this.auth.can('stocks:gerer');
  }

  get products(): Product[] {
    const query = this.search.trim().toLowerCase();
    return this.stock.products
      .filter((product) => product.actif && (!this.limited || product.type === 'fini'))
      .filter((product) => !this.onlyAlerts || product.stock <= product.seuil)
      .filter((product) => !query || `${product.libelle} ${product.reference}`.toLowerCase().includes(query))
      .sort((a, b) => (a.type === b.type ? a.libelle.localeCompare(b.libelle) : a.type === 'fini' ? -1 : 1));
  }

  get movements(): StockMovement[] {
    const query = this.search.trim().toLowerCase();
    return [...this.store.state.movements]
      .filter((movement) => movement.type !== 'vente' || this.filterType === 'vente')
      .filter((movement) => this.filterType === 'tous' || movement.type === this.filterType)
      .filter((movement) => !query || this.productLabel(movement.productId).toLowerCase().includes(query) || movement.motif.toLowerCase().includes(query))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 80);
  }

  get finis(): Product[] {
    return this.stock.products.filter((product) => product.type === 'fini' && product.actif);
  }

  get matieres(): Product[] {
    return this.stock.products.filter((product) => product.type === 'matiere' && product.actif);
  }

  get seuilEcart(): number {
    return this.store.state.settings.seuilEcartStock;
  }

  get alertCount(): number {
    return this.stock.alerts.length;
  }

  get stockValue(): number {
    return this.stock.products.filter((product) => product.type === 'matiere').reduce((sum, product) => sum + product.stock * product.prix, 0);
  }

  get selectedProduct(): Product | undefined {
    return this.form ? this.stock.product(this.form.productId) : undefined;
  }

  get delta(): number {
    const product = this.selectedProduct;
    if (!this.form || !product || this.form.quantite === null) {
      return 0;
    }
    const quantity = Number(this.form.quantite);
    return this.form.type === 'entree' ? quantity : this.form.type === 'inventaire' ? quantity - product.stock : -quantity;
  }

  get sensitive(): boolean {
    return !!this.form && (this.form.type === 'perte' || this.form.type === 'inventaire') && Math.abs(this.delta) >= this.store.state.settings.seuilEcartStock;
  }

  get countedEntries(): [string, number][] {
    return Object.entries(this.counts).filter(([, value]) => value !== null && value !== undefined && String(value) !== '') as [string, number][];
  }

  productLabel(id: string): string {
    return this.stock.product(id)?.libelle || 'Produit';
  }

  unit(id: string): string {
    return this.stock.product(id)?.unite || '';
  }

  openForm(product?: Product, type: ManualType = 'entree'): void {
    this.form = { productId: product?.id || this.stock.products[0].id, type, quantite: null, motif: '' };
  }

  submit(): void {
    if (this.form && this.form.quantite !== null && this.stock.record(this.form.productId, this.form.type, Number(this.form.quantite), this.form.motif)) {
      this.form = null;
    }
  }

  submitInventory(): void {
    const entries = this.countedEntries;
    let done = 0;
    entries.forEach(([productId, counted]) => {
      if (this.stock.record(productId, 'inventaire', Number(counted), this.inventoryMotif)) {
        done++;
      }
    });
    if (done === entries.length) {
      this.counts = {};
    }
  }

  level(product: Product): number {
    return Math.min(100, (product.stock / Math.max(product.seuil * 2, 1)) * 100);
  }

  statusOf(product: Product): { label: string; css: string } {
    if (product.stock === 0) { return { label: 'Rupture', css: 'badge--danger' }; }
    if (product.stock <= product.seuil / 2) { return { label: 'Critique', css: 'badge--danger' }; }
    if (product.stock <= product.seuil) { return { label: 'Faible', css: 'badge--warning' }; }
    return { label: 'Disponible', css: 'badge--success' };
  }
}
