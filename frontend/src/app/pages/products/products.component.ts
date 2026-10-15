import { Component } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { AuditLog, Product, ProductType } from '../../core/models';
import { ProductDraft, StockService } from '../../core/stock.service';
import { StoreService } from '../../core/store.service';

const CATEGORIES: { [type in ProductType]: string[] } = {
  fini: ['Pains', 'Viennoiseries', 'Pâtisseries'],
  matiere: ['Farines', 'Produits laitiers', 'Produits frais', 'Épicerie', 'Emballages']
};

@Component({
  selector: 'tm-products',
  templateUrl: './products.component.html'
})
export class ProductsComponent {
  type: ProductType = 'fini';
  search = '';
  showInactive = false;
  draft: ProductDraft | null = null;
  editing: Product | null = null;

  constructor(readonly auth: AuthService, private readonly stock: StockService, private readonly store: StoreService) {}

  get categories(): string[] {
    return CATEGORIES[this.draft?.type || this.type];
  }

  get products(): Product[] {
    const query = this.search.trim().toLowerCase();
    return this.stock.products
      .filter((product) => product.type === this.type && (this.showInactive || product.actif))
      .filter((product) => !query || `${product.libelle} ${product.reference} ${product.categorie}`.toLowerCase().includes(query))
      .sort((a, b) => a.reference.localeCompare(b.reference));
  }

  get count(): { fini: number; matiere: number } {
    return {
      fini: this.stock.products.filter((product) => product.type === 'fini' && product.actif).length,
      matiere: this.stock.products.filter((product) => product.type === 'matiere' && product.actif).length
    };
  }

  get history(): AuditLog[] {
    if (!this.editing) {
      return [];
    }
    const reference = this.editing.reference;
    return this.store.state.audit.filter((log) => log.ressource === 'Produits' && log.objet === reference).slice(-5).reverse();
  }

  create(): void {
    this.editing = null;
    this.draft = { libelle: '', categorie: CATEGORIES[this.type][0], type: this.type, unite: this.type === 'fini' ? 'pièce' : 'kg', prix: 0, seuil: 10, stock: 0, actif: true };
  }

  edit(product: Product): void {
    if (!this.auth.can('produits:gerer')) {
      return;
    }
    this.editing = product;
    this.draft = { id: product.id, libelle: product.libelle, categorie: product.categorie, type: product.type, unite: product.unite, prix: product.prix, seuil: product.seuil, stock: product.stock, actif: product.actif };
  }

  onTypeChange(): void {
    if (this.draft) {
      this.draft.categorie = CATEGORIES[this.draft.type][0];
      this.draft.unite = this.draft.type === 'fini' ? 'pièce' : 'kg';
    }
  }

  save(): void {
    if (this.draft && this.stock.saveProduct({
      ...this.draft,
      prix: Number(this.draft.prix),
      seuil: Number(this.draft.seuil),
      stock: this.auth.can('stocks:gerer') ? Number(this.draft.stock) : 0
    })) {
      this.draft = null;
    }
  }

  level(product: Product): number {
    return Math.min(100, (product.stock / Math.max(product.seuil * 2, 1)) * 100);
  }
}
