import { Component, HostListener } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { CashSession, PaymentMode, Product, Sale } from '../../core/models';
import { CartLine, PAYMENT_LABELS, SalesService } from '../../core/sales.service';
import { StoreService } from '../../core/store.service';

@Component({
  selector: 'tm-cash',
  templateUrl: './cash.component.html',
  styleUrls: ['./cash.component.scss']
})
export class CashComponent {
  readonly postes = ['Caisse 1 — Comptoir', 'Caisse 2 — Terrasse', 'Caisse 3 — Commandes'];
  readonly modes = Object.entries(PAYMENT_LABELS) as [PaymentMode, string][];
  readonly categories = ['Tous', 'Pains', 'Viennoiseries', 'Pâtisseries'];

  poste = this.postes[0];
  fondInitial = 25000;
  category = 'Tous';
  search = '';
  cart: CartLine[] = [];
  remisePct = 0;
  paiement: PaymentMode = 'especes';
  montantRecu: number | null = null;
  receipt: Sale | null = null;
  closing = false;
  declare: number | null = null;
  closedSession: CashSession | null = null;

  constructor(readonly sales: SalesService, readonly auth: AuthService, private readonly store: StoreService) {
    const free = this.postes.find((poste) => !this.store.state.sessions.some((session) => session.poste === poste && session.statut === 'ouverte'));
    this.poste = free || this.postes[0];
  }

  get session(): CashSession | undefined {
    return this.sales.mySession;
  }

  get maxRemise(): number {
    return this.store.state.settings.remiseMaxPct;
  }

  get occupiedPostes(): string[] {
    return this.store.state.sessions.filter((session) => session.statut === 'ouverte').map((session) => session.poste);
  }

  get products(): Product[] {
    const query = this.search.trim().toLowerCase();
    return this.store.state.products.filter((product) =>
      product.type === 'fini' && product.actif &&
      (this.category === 'Tous' || product.categorie === this.category) &&
      (!query || `${product.libelle} ${product.reference}`.toLowerCase().includes(query))
    );
  }

  get sessionSales(): Sale[] {
    return this.session ? this.sales.sessionSales(this.session).filter((sale) => sale.statut !== 'annulee') : [];
  }

  get sessionTotal(): number {
    return this.sessionSales.reduce((sum, sale) => sum + sale.total, 0);
  }

  get sousTotal(): number {
    return this.cart.reduce((sum, line) => sum + line.product.prix * line.quantite, 0);
  }

  get remise(): number {
    return Math.round((this.sousTotal * (this.remisePct || 0)) / 100);
  }

  get total(): number {
    return this.sousTotal - this.remise;
  }

  get itemCount(): number {
    return this.cart.reduce((sum, line) => sum + line.quantite, 0);
  }

  get rendu(): number {
    return (this.montantRecu || 0) - this.total;
  }

  get quickAmounts(): number[] {
    const total = this.total;
    const candidates = [Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000, Math.ceil(total / 5000) * 5000, 10000];
    return Array.from(new Set(candidates.filter((amount) => amount >= total && amount > 0))).sort((a, b) => a - b).slice(0, 4);
  }

  get canCheckout(): boolean {
    return this.cart.length > 0 && this.remisePct >= 0 && this.remisePct <= this.maxRemise
      && (this.paiement !== 'especes' || (this.montantRecu || 0) >= this.total);
  }

  inCart(product: Product): number {
    return this.cart.find((line) => line.product.id === product.id)?.quantite || 0;
  }

  add(product: Product): void {
    const line = this.cart.find((candidate) => candidate.product.id === product.id);
    if ((line?.quantite || 0) >= product.stock) {
      return;
    }
    if (line) {
      line.quantite++;
    } else {
      this.cart = [...this.cart, { product, quantite: 1 }];
    }
  }

  change(line: CartLine, delta: number): void {
    const next = line.quantite + delta;
    if (next > line.product.stock) {
      return;
    }
    line.quantite = next;
    if (line.quantite <= 0) {
      this.cart = this.cart.filter((candidate) => candidate !== line);
    }
  }

  clear(): void {
    this.cart = [];
    this.remisePct = 0;
    this.montantRecu = null;
    this.paiement = 'especes';
  }

  open(): void {
    this.sales.openSession(this.poste, Number(this.fondInitial));
  }

  checkout(): void {
    if (!this.canCheckout) {
      return;
    }
    const sale = this.sales.checkout(this.cart, Number(this.remisePct) || 0, this.paiement, this.paiement === 'especes' ? Number(this.montantRecu) : undefined);
    if (sale) {
      this.receipt = sale;
      this.clear();
    }
  }

  @HostListener('document:keydown', ['$event'])
  shortcuts(event: KeyboardEvent): void {
    if (event.key === 'F9' && this.session && !this.receipt && !this.closing) {
      event.preventDefault();
      this.checkout();
    }
  }

  print(): void {
    window.print();
  }

  startClosing(): void {
    this.declare = null;
    this.closedSession = null;
    this.closing = true;
  }

  close(): void {
    if (this.declare === null || this.declare < 0) {
      return;
    }
    this.closedSession = this.sales.closeSession(Number(this.declare));
  }

  finishClosing(): void {
    this.closing = false;
    this.closedSession = null;
  }

  label(mode: PaymentMode): string {
    return PAYMENT_LABELS[mode];
  }
}
