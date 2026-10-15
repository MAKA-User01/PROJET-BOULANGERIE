import { Injectable } from '@angular/core';
import { AccountingService } from './accounting.service';
import { AuthService } from './auth.service';
import { OrderLine, OrderStatus, PurchaseOrder, Supplier } from './models';
import { StoreService } from './store.service';
import { ToastService } from './toast.service';

export const ORDER_STATUS_LABELS: { [status in OrderStatus]: string } = {
  brouillon: 'Brouillon',
  en_validation: 'En validation',
  approuvee: 'Approuvée',
  rejetee: 'Rejetée',
  livree: 'Livrée',
  annulee: 'Annulée'
};

@Injectable({ providedIn: 'root' })
export class PurchaseService {
  constructor(
    private readonly store: StoreService,
    private readonly auth: AuthService,
    private readonly toast: ToastService,
    private readonly accounting: AccountingService
  ) {}

  get suppliers(): Supplier[] {
    return this.store.state.suppliers;
  }

  get orders(): PurchaseOrder[] {
    return [...this.store.state.orders].sort((a, b) => b.creeLe.localeCompare(a.creeLe));
  }

  supplier(id: string): Supplier | undefined {
    return this.suppliers.find((supplier) => supplier.id === id);
  }

  saveSupplier(draft: Omit<Supplier, 'id'> & { id?: string }): boolean {
    if (!this.auth.require('achats:preparer', 'Fournisseurs', 'gestion des fournisseurs')) {
      return false;
    }
    if (!draft.nom.trim() || !draft.telephone.trim()) {
      this.toast.error('Fiche incomplète', 'Le nom et le téléphone sont obligatoires.');
      return false;
    }
    if (draft.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email)) {
      this.toast.error('Adresse e-mail invalide');
      return false;
    }
    if (draft.id) {
      const existing = this.supplier(draft.id);
      if (!existing) {
        return false;
      }
      this.store.commit(() => Object.assign(existing, { ...draft, nom: draft.nom.trim() }));
      this.auth.trace('Modification de fournisseur', 'Fournisseurs', 'succes', { objet: existing.nom });
      this.toast.success('Fournisseur mis à jour', existing.nom);
    } else {
      const supplier: Supplier = { ...draft, id: this.store.uid('s'), nom: draft.nom.trim() };
      this.store.commit((db) => db.suppliers.push(supplier));
      this.auth.trace('Création de fournisseur', 'Fournisseurs', 'succes', { objet: supplier.nom });
      this.toast.success('Fournisseur ajouté', supplier.nom);
    }
    return true;
  }

  saveOrder(draft: { id?: string; fournisseurId: string; livraisonPrevue?: string; lignes: OrderLine[] }, submit: boolean): boolean {
    if (!this.auth.require('achats:preparer', 'Achats', 'préparation de commande')) {
      return false;
    }
    const lignes = draft.lignes.filter((line) => line.productId && line.quantite > 0 && line.prixUnitaire > 0);
    if (!draft.fournisseurId || !lignes.length) {
      this.toast.error('Commande incomplète', 'Choisissez un fournisseur et au moins une ligne valide.');
      return false;
    }
    const total = lignes.reduce((sum, line) => sum + line.quantite * line.prixUnitaire, 0);
    let order = draft.id ? this.store.state.orders.find((candidate) => candidate.id === draft.id) : undefined;
    if (order && order.statut !== 'brouillon') {
      this.toast.error('Commande verrouillée', 'Seul un brouillon peut être modifié.');
      return false;
    }
    this.store.commit((db) => {
      if (order) {
        Object.assign(order, { fournisseurId: draft.fournisseurId, livraisonPrevue: draft.livraisonPrevue, lignes, total });
      } else {
        order = {
          id: this.store.uid('o'),
          numero: `BC-${new Date().getFullYear()}-${String(this.store.nextNumber('commande')).padStart(4, '0')}`,
          fournisseurId: draft.fournisseurId, lignes, total, statut: 'brouillon', creePar: this.auth.user!.id,
          creeLe: new Date().toISOString(), livraisonPrevue: draft.livraisonPrevue, regle: false
        };
        db.orders.push(order);
      }
    });
    const saved = order as PurchaseOrder;
    this.auth.trace(draft.id ? 'Modification de commande' : 'Création de commande', 'Achats', 'succes', { objet: saved.numero, details: `${total} FCFA` });
    if (submit) {
      this.submit(saved);
    } else {
      this.toast.success('Brouillon enregistré', saved.numero);
    }
    return true;
  }

  /** Sous le seuil : approbation automatique. Au-delà : validation du Manager requise. */
  submit(order: PurchaseOrder): void {
    if (!this.auth.require('achats:preparer', 'Achats', 'soumission de commande') || order.statut !== 'brouillon') {
      return;
    }
    const needsApproval = order.total >= this.store.state.settings.seuilAchat;
    this.store.commit(() => {
      order.soumisLe = new Date().toISOString();
      order.statut = needsApproval ? 'en_validation' : 'approuvee';
      if (!needsApproval) {
        order.valideLe = order.soumisLe;
      }
    });
    this.auth.trace(needsApproval ? 'Commande soumise à validation' : 'Commande approuvée automatiquement (sous le seuil)', 'Achats', 'succes', { objet: order.numero });
    this.toast.success(needsApproval ? 'Commande transmise au Manager' : 'Commande approuvée', needsApproval
      ? `Montant supérieur au seuil de ${this.store.state.settings.seuilAchat.toLocaleString('fr-FR')} FCFA.`
      : 'Montant sous le seuil de validation.');
  }

  decide(order: PurchaseOrder, approve: boolean, motif = ''): void {
    if (!this.auth.require('achats:valider', 'Achats', 'validation de commande') || order.statut !== 'en_validation') {
      return;
    }
    if (this.store.state.settings.separationTaches && order.creePar === this.auth.user?.id) {
      this.auth.trace('Auto-approbation bloquée', 'Achats', 'refus', { objet: order.numero, motif: 'Séparation des tâches' });
      this.toast.error('Séparation des tâches', 'Vous ne pouvez pas approuver une commande que vous avez créée.');
      return;
    }
    if (!approve && !motif.trim()) {
      this.toast.error('Motif requis', 'Indiquez la raison du rejet.');
      return;
    }
    this.store.commit(() => {
      order.statut = approve ? 'approuvee' : 'rejetee';
      order.validePar = this.auth.user!.id;
      order.valideLe = new Date().toISOString();
      order.motifRejet = approve ? undefined : motif.trim();
    });
    this.auth.trace(approve ? 'Validation de commande' : 'Rejet de commande', 'Achats', 'succes', { objet: order.numero, motif: motif || undefined });
    this.toast.success(approve ? 'Commande approuvée' : 'Commande rejetée', order.numero);
  }

  /** Réception : chaque ligne génère une entrée en stock rattachée au bon de commande (§5.6). */
  receive(order: PurchaseOrder): void {
    if (!this.auth.require('achats:preparer', 'Achats', 'réception de livraison') || order.statut !== 'approuvee') {
      return;
    }
    const now = new Date().toISOString();
    this.store.commit((db) => {
      order.lignes.forEach((line) => {
        const product = db.products.find((candidate) => candidate.id === line.productId);
        if (product) {
          db.movements.push({
            id: this.store.uid('mv'), date: now, productId: product.id, type: 'livraison', quantite: line.quantite,
            stockAvant: product.stock, stockApres: product.stock + line.quantite, motif: `Réception ${order.numero}`,
            auteurId: this.auth.user!.id, statut: 'applique', reference: order.numero
          });
          product.stock += line.quantite;
        }
      });
      order.statut = 'livree';
      order.livreLe = now;
    });
    const supplier = this.supplier(order.fournisseurId);
    this.accounting.generate('AC', `Facture ${supplier?.nom || ''} — ${order.numero}`, [
      { compte: '601', libelle: 'Achats de matières premières', debit: order.total, credit: 0 },
      { compte: '401', libelle: 'Fournisseurs', debit: 0, credit: order.total }
    ], 'Réception de commande');
    this.auth.trace('Réception de livraison', 'Achats', 'succes', { objet: order.numero, details: `${order.lignes.length} ligne(s) entrée(s) en stock` });
    this.toast.success('Livraison réceptionnée', 'Les quantités ont été ajoutées au stock.');
  }

  cancel(order: PurchaseOrder): void {
    if (!this.auth.require('achats:preparer', 'Achats', 'annulation de commande')) {
      return;
    }
    if (!['brouillon', 'approuvee', 'en_validation'].includes(order.statut)) {
      return;
    }
    this.store.commit(() => (order.statut = 'annulee'));
    this.auth.trace('Annulation de commande', 'Achats', 'succes', { objet: order.numero });
    this.toast.success('Commande annulée', order.numero);
  }
}
