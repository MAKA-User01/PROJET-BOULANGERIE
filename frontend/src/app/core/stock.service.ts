import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { MovementType, Product, ProductType, StockMovement } from './models';
import { StoreService } from './store.service';
import { ToastService } from './toast.service';

export const MOVEMENT_LABELS: { [type in MovementType]: string } = {
  entree: 'Entrée',
  sortie: 'Sortie',
  perte: 'Perte',
  inventaire: 'Inventaire',
  vente: 'Vente',
  livraison: 'Livraison',
  annulation: 'Annulation de vente'
};

export interface ProductDraft {
  id?: string;
  libelle: string;
  categorie: string;
  type: ProductType;
  unite: string;
  prix: number;
  seuil: number;
  stock: number;
  actif: boolean;
}

@Injectable({ providedIn: 'root' })
export class StockService {
  constructor(private readonly store: StoreService, private readonly auth: AuthService, private readonly toast: ToastService) {}

  get products(): Product[] {
    return this.store.state.products;
  }

  get alerts(): Product[] {
    return this.products.filter((product) => product.actif && product.stock <= product.seuil);
  }

  get pendingMovements(): StockMovement[] {
    return this.store.state.movements.filter((movement) => movement.statut === 'en_attente');
  }

  product(id: string): Product | undefined {
    return this.products.find((product) => product.id === id);
  }

  saveProduct(draft: ProductDraft): boolean {
    if (!this.auth.require('produits:gerer', 'Produits', 'modification du catalogue')) {
      return false;
    }
    const libelle = draft.libelle.trim();
    if (!libelle || !(draft.prix > 0) || draft.seuil < 0) {
      this.toast.error('Fiche incomplète', 'Libellé, prix strictement positif et seuil sont requis.');
      return false;
    }
    if (this.products.some((product) => product.id !== draft.id && product.libelle.toLowerCase() === libelle.toLowerCase())) {
      this.toast.error('Doublon', 'Un produit porte déjà ce libellé.');
      return false;
    }
    if (draft.id) {
      const product = this.product(draft.id);
      if (!product) {
        return false;
      }
      const changes: string[] = [];
      if (product.prix !== draft.prix) { changes.push(`prix ${product.prix} → ${draft.prix} FCFA`); }
      if (product.actif !== draft.actif) { changes.push(`statut ${product.actif ? 'actif' : 'inactif'} → ${draft.actif ? 'actif' : 'inactif'}`); }
      if (product.seuil !== draft.seuil) { changes.push(`seuil ${product.seuil} → ${draft.seuil}`); }
      if (product.libelle !== libelle) { changes.push(`libellé « ${product.libelle} » → « ${libelle} »`); }
      this.store.commit(() => Object.assign(product, {
        libelle, categorie: draft.categorie, unite: draft.unite, prix: draft.prix, seuil: draft.seuil, actif: draft.actif
      }));
      this.auth.trace('Modification de fiche produit', 'Produits', 'succes', { objet: product.reference, details: changes.join(' ; ') || 'Aucun changement' });
      this.toast.success('Fiche produit mise à jour', product.libelle);
      return true;
    }
    const prefix = draft.type === 'matiere' ? 'MAT' : draft.categorie === 'Pains' ? 'PAI' : draft.categorie === 'Viennoiseries' ? 'VIE' : 'PAT';
    const count = this.products.filter((product) => product.reference.startsWith(prefix)).length + 1;
    const product: Product = {
      id: this.store.uid('p'),
      reference: `${prefix}-${String(count).padStart(3, '0')}`,
      libelle, categorie: draft.categorie, type: draft.type, unite: draft.unite, prix: draft.prix,
      stock: 0, seuil: draft.seuil, actif: draft.actif
    };
    this.store.commit((db) => db.products.push(product));
    this.auth.trace('Création de fiche produit', 'Produits', 'succes', { objet: product.reference, details: `${libelle} · ${draft.prix} FCFA` });
    if (draft.stock > 0) {
      this.record(product.id, 'entree', draft.stock, 'Stock initial à la création');
    }
    this.toast.success('Produit ajouté au catalogue', `${product.reference} · ${libelle}`);
    return true;
  }

  /**
   * Enregistre un mouvement. Les pertes et écarts d'inventaire au-delà du seuil
   * sont soumis à la validation du Manager avant d'impacter le stock (§5.4).
   */
  record(productId: string, type: 'entree' | 'sortie' | 'perte' | 'inventaire', quantity: number, motif: string): boolean {
    if (!this.auth.require('stocks:gerer', 'Stocks', 'mouvement de stock')) {
      return false;
    }
    const product = this.product(productId);
    if (!product) {
      return false;
    }
    if (!motif.trim()) {
      this.toast.error('Motif obligatoire', 'Chaque mouvement doit être justifié.');
      return false;
    }
    if (!(quantity >= 0) || (type !== 'inventaire' && quantity === 0)) {
      this.toast.error('Quantité invalide');
      return false;
    }
    const delta = type === 'entree' ? quantity : type === 'inventaire' ? quantity - product.stock : -quantity;
    if (type === 'inventaire' && delta === 0) {
      this.auth.trace('Inventaire sans écart', 'Stocks', 'succes', { objet: product.reference });
      this.toast.success('Inventaire conforme', `${product.libelle} : aucun écart.`);
      return true;
    }
    if (product.stock + delta < 0) {
      this.toast.error('Stock insuffisant', `Seulement ${product.stock} ${product.unite} disponible(s).`);
      return false;
    }
    const sensitive = (type === 'perte' || type === 'inventaire') && Math.abs(delta) >= this.store.state.settings.seuilEcartStock;
    const movement: StockMovement = {
      id: this.store.uid('mv'), date: new Date().toISOString(), productId, type, quantite: delta,
      stockAvant: product.stock, stockApres: product.stock + delta, motif: motif.trim(),
      auteurId: this.auth.user!.id, statut: sensitive ? 'en_attente' : 'applique'
    };
    this.store.commit((db) => {
      db.movements.push(movement);
      if (!sensitive) {
        product.stock += delta;
      }
    });
    this.auth.trace(sensitive ? `${MOVEMENT_LABELS[type]} soumise à validation` : `Mouvement de stock : ${MOVEMENT_LABELS[type]}`, 'Stocks', 'succes', {
      objet: product.reference, motif, details: `${delta > 0 ? '+' : ''}${delta} ${product.unite}`
    });
    if (sensitive) {
      this.toast.info('Ajustement soumis au Manager', `L’écart de ${Math.abs(delta)} ${product.unite} dépasse le seuil autorisé.`);
    } else {
      this.toast.success('Mouvement enregistré', `${product.libelle} : ${product.stock} ${product.unite} en stock.`);
    }
    return true;
  }

  decide(movement: StockMovement, approve: boolean, motif = ''): void {
    if (!this.auth.require('stocks:valider', 'Stocks', 'validation d’ajustement')) {
      return;
    }
    if (movement.statut !== 'en_attente') {
      return;
    }
    if (movement.auteurId === this.auth.user?.id) {
      this.auth.trace('Auto-validation bloquée', 'Stocks', 'refus', { objet: movement.id });
      this.toast.error('Séparation des tâches', 'Un ajustement doit être validé par une autre personne.');
      return;
    }
    const product = this.product(movement.productId);
    if (!product) {
      return;
    }
    if (approve && product.stock + movement.quantite < 0) {
      this.toast.error('Validation impossible', 'Le stock actuel ne permet plus cet ajustement.');
      return;
    }
    this.store.commit(() => {
      movement.validePar = this.auth.user!.id;
      if (approve) {
        movement.stockAvant = product.stock;
        movement.stockApres = product.stock + movement.quantite;
        movement.statut = 'applique';
        product.stock += movement.quantite;
      } else {
        movement.statut = 'rejete';
        movement.motif = `${movement.motif} — Refusé : ${motif || 'sans motif'}`;
      }
    });
    this.auth.trace(approve ? 'Ajustement de stock validé' : 'Ajustement de stock refusé', 'Stocks', 'succes', {
      objet: product.reference, details: `${movement.quantite} ${product.unite}`, motif: motif || undefined
    });
    this.toast.success(approve ? 'Ajustement appliqué' : 'Ajustement refusé', product.libelle);
  }
}
