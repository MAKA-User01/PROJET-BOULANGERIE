import { Injectable } from '@angular/core';
import { AccountingService } from './accounting.service';
import { AuthService } from './auth.service';
import { CashSession, PaymentMode, Product, Sale } from './models';
import { StoreService } from './store.service';
import { ToastService } from './toast.service';

export const PAYMENT_LABELS: { [mode in PaymentMode]: string } = {
  especes: 'Espèces',
  momo: 'MTN MoMo',
  orange_money: 'Orange Money',
  carte: 'Carte bancaire'
};

const PAYMENT_ACCOUNTS: { [mode in PaymentMode]: { compte: string; tresorerie: string } } = {
  especes: { compte: '571', tresorerie: 't-caisse' },
  momo: { compte: '5211', tresorerie: 't-momo' },
  orange_money: { compte: '5212', tresorerie: 't-om' },
  carte: { compte: '521', tresorerie: 't-banque' }
};

export interface CartLine {
  product: Product;
  quantite: number;
}

@Injectable({ providedIn: 'root' })
export class SalesService {
  constructor(
    private readonly store: StoreService,
    private readonly auth: AuthService,
    private readonly toast: ToastService,
    private readonly accounting: AccountingService
  ) {}

  get mySession(): CashSession | undefined {
    const userId = this.auth.user?.id;
    return this.store.state.sessions.find((session) => session.caissierId === userId && session.statut === 'ouverte');
  }

  /** Le Caissier ne voit que ses propres opérations ; superviseurs et lecteurs de rapports voient tout. */
  get visibleSales(): Sale[] {
    const all = this.store.state.sales;
    const visible = this.auth.can('ventes:superviser') || this.auth.can('ventes:rapport')
      ? all
      : all.filter((sale) => sale.caissierId === this.auth.user?.id);
    return [...visible].sort((a, b) => b.date.localeCompare(a.date));
  }

  sessionSales(session: CashSession): Sale[] {
    return this.store.state.sales.filter((sale) => sale.sessionId === session.id);
  }

  expectedCash(session: CashSession): number {
    return session.fondInitial + this.sessionSales(session)
      .filter((sale) => sale.paiement === 'especes' && sale.statut !== 'annulee')
      .reduce((sum, sale) => sum + sale.total, 0);
  }

  openSession(poste: string, fondInitial: number): void {
    if (!this.auth.require('ventes:caisse', 'Caisse', 'ouverture de caisse')) {
      return;
    }
    if (this.mySession) {
      this.toast.info('Votre caisse est déjà ouverte.');
      return;
    }
    if (this.store.state.sessions.some((session) => session.poste === poste && session.statut === 'ouverte')) {
      this.toast.error('Poste occupé', `${poste} est déjà ouvert par un autre caissier.`);
      return;
    }
    if (!(fondInitial >= 0)) {
      this.toast.error('Fond de caisse invalide');
      return;
    }
    const session: CashSession = {
      id: this.store.uid('cs'), poste, caissierId: this.auth.user!.id, ouverture: new Date().toISOString(),
      fondInitial, statut: 'ouverte'
    };
    this.store.commit((db) => db.sessions.push(session));
    this.auth.trace('Ouverture de caisse', 'Caisse', 'succes', { objet: poste, details: `Fond initial ${fondInitial} FCFA` });
    this.toast.success('Caisse ouverte', `${poste} · fond de ${fondInitial.toLocaleString('fr-FR')} FCFA`);
  }

  closeSession(declare: number): CashSession | null {
    const session = this.mySession;
    if (!session || !this.auth.require('ventes:caisse', 'Caisse', 'clôture de caisse')) {
      return null;
    }
    if (!(declare >= 0)) {
      this.toast.error('Montant déclaré invalide');
      return null;
    }
    const attendu = this.expectedCash(session);
    const ecart = declare - attendu;
    const sales = this.sessionSales(session).filter((sale) => sale.statut !== 'annulee');
    const byMode = new Map<PaymentMode, number>();
    sales.forEach((sale) => byMode.set(sale.paiement, (byMode.get(sale.paiement) || 0) + sale.total));

    this.store.commit((db) => {
      session.fermeture = new Date().toISOString();
      session.attendu = attendu;
      session.declare = declare;
      session.ecart = ecart;
      session.statut = 'fermee';
      byMode.forEach((montant, mode) => {
        const versement = mode === 'especes' ? montant + ecart : montant;
        const account = db.accounts.find((candidate) => candidate.id === PAYMENT_ACCOUNTS[mode].tresorerie);
        if (account && versement > 0) {
          account.solde += versement;
          db.treasury.push({
            id: this.store.uid('tm'), date: session.fermeture as string, compteId: account.id, sens: 'entree',
            montant: versement, categorie: 'Recettes de caisse', libelle: `Recettes ${session.poste} — ${this.labelMode(mode)}`,
            auteurId: session.caissierId
          });
        }
      });
    });

    const total = sales.reduce((sum, sale) => sum + sale.total, 0);
    if (total > 0) {
      const lignes = Array.from(byMode.entries()).map(([mode, montant]) => ({
        compte: PAYMENT_ACCOUNTS[mode].compte, libelle: this.labelMode(mode), debit: montant, credit: 0
      }));
      lignes.push({ compte: '702', libelle: 'Ventes de produits finis', debit: 0, credit: total });
      if (ecart !== 0) {
        lignes.push(ecart < 0
          ? { compte: '658-1', libelle: 'Écart de caisse', debit: -ecart, credit: 0 }
          : { compte: '758', libelle: 'Excédent de caisse', debit: 0, credit: ecart });
        lignes.push(ecart < 0
          ? { compte: '571', libelle: 'Caisse', debit: 0, credit: -ecart }
          : { compte: '571', libelle: 'Caisse', debit: ecart, credit: 0 });
      }
      this.accounting.generate('VE', `Ventes ${session.poste} du ${new Date().toLocaleDateString('fr-FR')}`, lignes, 'Clôture de caisse');
    }
    this.auth.trace('Clôture de caisse', 'Caisse', 'succes', {
      objet: session.poste,
      details: `Attendu ${attendu} · déclaré ${declare} · écart ${ecart} FCFA`
    });
    this.toast.success('Caisse clôturée', ecart === 0 ? 'Aucun écart constaté.' : `Écart de ${ecart.toLocaleString('fr-FR')} FCFA enregistré.`);
    return session;
  }

  /** Enregistrement transactionnel : contrôle de toutes les lignes puis mise à jour simultanée vente + stock. */
  checkout(cart: CartLine[], remisePct: number, paiement: PaymentMode, montantRecu?: number): Sale | null {
    if (!this.auth.require('ventes:caisse', 'Ventes', 'encaissement')) {
      return null;
    }
    const session = this.mySession;
    if (!session) {
      this.toast.error('Caisse fermée', 'Ouvrez votre caisse avant d’encaisser.');
      return null;
    }
    const lines = cart.filter((line) => line.quantite > 0);
    if (!lines.length) {
      return null;
    }
    const maxRemise = this.store.state.settings.remiseMaxPct;
    if (remisePct < 0 || remisePct > maxRemise) {
      this.auth.trace('Remise refusée', 'Ventes', 'refus', { motif: `Remise de ${remisePct} % > ${maxRemise} % autorisés` });
      this.toast.error('Remise non autorisée', `La remise maximale autorisée est de ${maxRemise} %.`);
      return null;
    }
    for (const line of lines) {
      const product = this.store.state.products.find((candidate) => candidate.id === line.product.id);
      if (!product || !product.actif || product.type !== 'fini') {
        this.toast.error('Produit indisponible', line.product.libelle);
        return null;
      }
      if (product.stock < line.quantite) {
        this.toast.error('Stock insuffisant', `${product.libelle} : ${product.stock} disponible(s).`);
        return null;
      }
    }
    const sousTotal = lines.reduce((sum, line) => sum + line.product.prix * line.quantite, 0);
    const remise = Math.round((sousTotal * remisePct) / 100);
    const total = sousTotal - remise;
    if (paiement === 'especes' && (montantRecu === undefined || montantRecu < total)) {
      this.toast.error('Montant reçu insuffisant', `Le total à encaisser est de ${total.toLocaleString('fr-FR')} FCFA.`);
      return null;
    }
    const number = this.store.nextNumber('vente');
    const sale: Sale = {
      id: this.store.uid('v'),
      numero: `VT-${String(number).padStart(6, '0')}`,
      date: new Date().toISOString(),
      caissierId: this.auth.user!.id,
      sessionId: session.id,
      lignes: lines.map((line) => ({ productId: line.product.id, libelle: line.product.libelle, quantite: line.quantite, prixUnitaire: line.product.prix })),
      sousTotal, remise, total, paiement,
      montantRecu: paiement === 'especes' ? montantRecu : undefined,
      statut: 'validee'
    };
    this.store.commit((db) => {
      sale.lignes.forEach((line) => {
        const product = db.products.find((candidate) => candidate.id === line.productId) as Product;
        db.movements.push({
          id: this.store.uid('mv'), date: sale.date, productId: product.id, type: 'vente', quantite: -line.quantite,
          stockAvant: product.stock, stockApres: product.stock - line.quantite, motif: `Vente ${sale.numero}`,
          auteurId: sale.caissierId, statut: 'applique', reference: sale.numero
        });
        product.stock -= line.quantite;
      });
      db.sales.push(sale);
    });
    this.auth.trace('Enregistrement de vente', 'Ventes', 'succes', {
      objet: sale.numero,
      details: `${total} FCFA · ${this.labelMode(paiement)}${remise ? ` · remise ${remisePct} %` : ''}`
    });
    return sale;
  }

  requestCancellation(sale: Sale, motif: string): void {
    if (!this.auth.require('ventes:caisse', 'Ventes', 'demande d’annulation')) {
      return;
    }
    if (sale.caissierId !== this.auth.user?.id || sale.statut !== 'validee') {
      this.auth.trace('Demande d’annulation refusée', 'Ventes', 'refus', { objet: sale.numero, motif: 'Vente non éligible' });
      this.toast.error('Annulation impossible', 'Seules vos ventes validées peuvent faire l’objet d’une demande.');
      return;
    }
    if (motif.trim().length < 5) {
      this.toast.error('Motif requis', 'Expliquez la raison de l’annulation.');
      return;
    }
    this.store.commit(() => {
      sale.statut = 'annulation_demandee';
      sale.motifAnnulation = motif.trim();
    });
    this.auth.trace('Demande d’annulation de vente', 'Ventes', 'succes', { objet: sale.numero, motif });
    this.toast.success('Demande transmise', 'Le Manager doit valider l’annulation.');
  }

  decideCancellation(sale: Sale, approve: boolean): void {
    if (!this.auth.require('ventes:superviser', 'Ventes', 'validation d’annulation')) {
      return;
    }
    if (sale.statut !== 'annulation_demandee') {
      return;
    }
    if (sale.caissierId === this.auth.user?.id) {
      this.auth.trace('Auto-validation bloquée', 'Ventes', 'refus', { objet: sale.numero });
      this.toast.error('Séparation des tâches', 'Vous ne pouvez pas valider votre propre demande.');
      return;
    }
    this.store.commit((db) => {
      if (approve) {
        sale.statut = 'annulee';
        sale.annulePar = this.auth.user!.id;
        sale.lignes.forEach((line) => {
          const product = db.products.find((candidate) => candidate.id === line.productId);
          if (product) {
            db.movements.push({
              id: this.store.uid('mv'), date: new Date().toISOString(), productId: product.id, type: 'annulation',
              quantite: line.quantite, stockAvant: product.stock, stockApres: product.stock + line.quantite,
              motif: `Annulation ${sale.numero}`, auteurId: this.auth.user!.id, statut: 'applique', reference: sale.numero
            });
            product.stock += line.quantite;
          }
        });
      } else {
        sale.statut = 'validee';
      }
    });
    this.auth.trace(approve ? 'Annulation de vente validée' : 'Annulation de vente refusée', 'Ventes', 'succes', {
      objet: sale.numero, motif: sale.motifAnnulation
    });
    this.toast.success(approve ? 'Vente annulée' : 'Demande refusée', sale.numero);
  }

  labelMode(mode: PaymentMode): string {
    return PAYMENT_LABELS[mode];
  }
}
