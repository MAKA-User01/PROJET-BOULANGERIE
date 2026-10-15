import { Component } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { CashSession, PaymentMode, Sale, SaleStatus } from '../../core/models';
import { PAYMENT_LABELS, SalesService } from '../../core/sales.service';
import { StoreService } from '../../core/store.service';

type Period = 'jour' | 'semaine' | 'tout';

@Component({
  selector: 'tm-sales',
  templateUrl: './sales.component.html',
  styles: [`
    .mode-bars { display: flex; flex-direction: column; gap: 7px; }
    .mode-bars > div { display: grid; grid-template-columns: 92px 1fr 38px; align-items: center; gap: 8px; font-size: 12px; }
    .mode-bars span { color: var(--ink-500); font-weight: 600; }
    .mode-bars strong { text-align: right; }
  `]
})
export class SalesComponent {
  tab: 'ventes' | 'sessions' = 'ventes';
  period: Period = 'jour';
  status: SaleStatus | 'toutes' = 'toutes';
  search = '';
  selected: Sale | null = null;
  motif = '';
  limit = 40;
  readonly trackByIndex = (index: number) => index;

  readonly statusLabels: { [key in SaleStatus]: string } = {
    validee: 'Validée',
    annulation_demandee: 'Annulation demandée',
    annulee: 'Annulée'
  };

  constructor(readonly sales: SalesService, readonly auth: AuthService, private readonly store: StoreService) {}

  get scopeLabel(): string {
    return this.auth.can('ventes:superviser') ? 'Supervision de toutes les caisses' : this.auth.can('ventes:rapport') ? 'Rapport des ventes (lecture seule)' : 'Vos opérations uniquement';
  }

  get filtered(): Sale[] {
    const query = this.search.trim().toLowerCase();
    const since = this.period === 'jour' ? new Date(new Date().toDateString()).getTime() : this.period === 'semaine' ? Date.now() - 7 * 86400000 : 0;
    return this.sales.visibleSales.filter((sale) =>
      new Date(sale.date).getTime() >= since &&
      (this.status === 'toutes' || sale.statut === this.status) &&
      (!query || sale.numero.toLowerCase().includes(query) || sale.lignes.some((line) => line.libelle.toLowerCase().includes(query)))
    );
  }

  get totals(): { total: number; count: number; average: number; byMode: { mode: string; amount: number; share: number }[] } {
    const valid = this.filtered.filter((sale) => sale.statut !== 'annulee');
    const total = valid.reduce((sum, sale) => sum + sale.total, 0);
    const modes = Object.keys(PAYMENT_LABELS) as PaymentMode[];
    return {
      total,
      count: valid.length,
      average: valid.length ? Math.round(total / valid.length) : 0,
      byMode: modes.map((mode) => {
        const amount = valid.filter((sale) => sale.paiement === mode).reduce((sum, sale) => sum + sale.total, 0);
        return { mode: PAYMENT_LABELS[mode], amount, share: total ? (amount / total) * 100 : 0 };
      })
    };
  }

  get sessions(): CashSession[] {
    const all = [...this.store.state.sessions].sort((a, b) => b.ouverture.localeCompare(a.ouverture));
    return this.auth.can('ventes:superviser') ? all : all.filter((session) => session.caissierId === this.auth.user?.id);
  }

  get canSeeSessions(): boolean {
    return this.auth.can('ventes:superviser') || this.auth.can('ventes:caisse');
  }

  label(mode: PaymentMode): string {
    return PAYMENT_LABELS[mode];
  }

  badge(status: SaleStatus): string {
    return status === 'validee' ? 'badge--success' : status === 'annulee' ? 'badge--danger' : 'badge--warning';
  }

  open(sale: Sale): void {
    this.selected = sale;
    this.motif = '';
  }

  canRequest(sale: Sale): boolean {
    return this.auth.can('ventes:caisse') && sale.caissierId === this.auth.user?.id && sale.statut === 'validee';
  }

  request(): void {
    if (this.selected) {
      this.sales.requestCancellation(this.selected, this.motif);
      if (this.selected.statut === 'annulation_demandee') {
        this.selected = null;
      }
    }
  }

  decide(approve: boolean): void {
    if (this.selected) {
      this.sales.decideCancellation(this.selected, approve);
      this.selected = null;
    }
  }

  sessionTotal(session: CashSession): number {
    return this.sales.sessionSales(session).filter((sale) => sale.statut !== 'annulee').reduce((sum, sale) => sum + sale.total, 0);
  }

  items(sale: Sale): number {
    return sale.lignes.reduce((sum, line) => sum + line.quantite, 0);
  }
}
