import { Component } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { FinanceService } from '../../core/finance.service';
import { AuditLog, Product, PurchaseOrder, Sale } from '../../core/models';
import { RoleDefinition, roleOf } from '../../core/rbac';
import { SalesService } from '../../core/sales.service';
import { StoreService } from '../../core/store.service';

interface Kpi {
  label: string;
  value: string;
  unit?: string;
  icon: string;
  tone: string;
  foot: string;
  link?: string;
}

interface DayBar {
  label: string;
  date: string;
  total: number;
  tickets: number;
  height: number;
  today: boolean;
}

@Component({
  selector: 'tm-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {
  hoveredIndex: number | null = null;
  readonly trackByIndex = (index: number) => index;

  constructor(
    readonly auth: AuthService,
    private readonly store: StoreService,
    private readonly sales: SalesService,
    readonly finance: FinanceService
  ) {}

  get role(): RoleDefinition {
    return roleOf(this.auth.user!.role);
  }

  get greeting(): string {
    const hour = new Date().getHours();
    return hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
  }

  get heroCopy(): { text: string; cta?: { label: string; link: string; icon: string } } {
    switch (this.auth.user!.role) {
      case 'caissier':
        return this.sales.mySession
          ? { text: `Votre caisse « ${this.sales.mySession.poste} » est ouverte. Bon service !`, cta: { label: 'Encaisser une vente', link: '/app/caisse', icon: 'cash' } }
          : { text: 'Votre caisse n’est pas encore ouverte. Comptez votre fond et lancez la journée.', cta: { label: 'Ouvrir ma caisse', link: '/app/caisse', icon: 'cash' } };
      case 'stock':
        return { text: `${this.alerts.length} produit(s) sous le seuil d’alerte aujourd’hui.`, cta: { label: 'Enregistrer un mouvement', link: '/app/stocks', icon: 'box' } };
      case 'acheteur':
        return { text: `${this.ordersIn('approuvee').length} commande(s) attendent leur livraison.`, cta: { label: 'Préparer une commande', link: '/app/achats', icon: 'cart' } };
      case 'financier':
        return { text: 'Suivez les encaissements, les règlements fournisseurs et vos budgets du mois.', cta: { label: 'Ouvrir la trésorerie', link: '/app/tresorerie', icon: 'wallet' } };
      case 'comptable':
        return { text: `${this.draftEntries} écriture(s) attendent votre contrôle.`, cta: { label: 'Contrôler les écritures', link: '/app/comptabilite', icon: 'ledger' } };
      case 'manager':
        return { text: `${this.pendingValidations} opération(s) sensible(s) attendent votre validation.`, cta: { label: 'Voir les validations', link: '/app/validations', icon: 'stamp' } };
      default:
        return { text: 'Configuration, sauvegardes et journaux techniques sont sous votre surveillance.', cta: { label: 'Administration', link: '/app/administration', icon: 'settings' } };
    }
  }

  get kpis(): Kpi[] {
    const kpis: Kpi[] = [];
    const db = this.store.state;
    const todaySales = this.todaySales;
    if (this.auth.can('ventes:caisse')) {
      const mine = todaySales.filter((sale) => sale.caissierId === this.auth.user!.id);
      kpis.push({ label: 'Mes ventes du jour', value: this.format(this.sum(mine)), unit: 'FCFA', icon: 'coin', tone: 'gold', foot: `${mine.length} ticket(s) encaissé(s)` });
      kpis.push({ label: 'Ma caisse', value: this.sales.mySession ? 'Ouverte' : 'Fermée', icon: 'cash', tone: this.sales.mySession ? 'okok' : 'slate', foot: this.sales.mySession ? this.sales.mySession.poste : 'À ouvrir avant d’encaisser', link: '/app/caisse' });
    }
    if (this.auth.can('ventes:superviser') || this.auth.can('ventes:rapport')) {
      const total = this.sum(todaySales);
      const yesterday = this.sum(this.salesOn(1));
      const delta = yesterday ? Math.round(((total - yesterday) / yesterday) * 100) : 0;
      kpis.push({ label: 'Chiffre d’affaires du jour', value: this.format(total), unit: 'FCFA', icon: 'coin', tone: 'crust', foot: `${delta >= 0 ? '+' : ''}${delta} % vs. hier (journée complète)` });
      kpis.push({ label: 'Panier moyen', value: this.format(todaySales.length ? Math.round(total / todaySales.length) : 0), unit: 'FCFA', icon: 'receipt', tone: 'gold', foot: `${todaySales.length} ticket(s) aujourd’hui` });
    }
    if (this.pendingValidations > 0 || this.auth.can('achats:valider')) {
      kpis.push({ label: 'Validations en attente', value: String(this.pendingValidations), icon: 'stamp', tone: 'folere', foot: 'Opérations sensibles à arbitrer', link: '/app/validations' });
    }
    if (this.auth.can('stocks:lire') || this.auth.can('stocks:lire_limite')) {
      kpis.push({ label: 'Produits en alerte', value: String(this.alerts.length), icon: 'alert', tone: 'gold', foot: 'Sous le seuil de réapprovisionnement', link: '/app/stocks' });
    }
    if (this.auth.can('stocks:gerer')) {
      kpis.push({ label: 'Ajustements en attente', value: String(db.movements.filter((movement) => movement.statut === 'en_attente').length), icon: 'clock', tone: 'indigo', foot: 'Soumis à validation du Manager' });
    }
    if (this.auth.can('achats:preparer')) {
      kpis.push({ label: 'Commandes en cours', value: String(db.orders.filter((order) => ['brouillon', 'en_validation', 'approuvee'].includes(order.statut)).length), icon: 'cart', tone: 'indigo', foot: `${this.ordersIn('en_validation').length} en validation`, link: '/app/achats' });
    }
    if (this.auth.can('tresorerie:lire')) {
      kpis.push({ label: 'Trésorerie disponible', value: this.format(this.finance.totalCash), unit: 'FCFA', icon: 'wallet', tone: 'okok', foot: `${this.finance.accounts.length} comptes suivis`, link: '/app/tresorerie' });
    }
    if (this.auth.can('tresorerie:gerer')) {
      kpis.push({ label: 'Paiements à exécuter', value: String(db.paymentRequests.filter((request) => request.statut === 'approuvee').length), icon: 'coin', tone: 'folere', foot: `${db.orders.filter((order) => order.statut === 'livree' && !order.regle).length} facture(s) fournisseur non réglée(s)` });
    }
    if (this.auth.can('compta:saisir')) {
      kpis.push({ label: 'Écritures à contrôler', value: String(this.draftEntries), icon: 'ledger', tone: 'indigo', foot: 'Brouillons générés ou saisis', link: '/app/comptabilite' });
    }
    if (this.auth.can('config:gerer')) {
      const day = Date.now() - 86400000;
      kpis.push({ label: 'Comptes actifs', value: String(db.users.filter((user) => user.actif).length), icon: 'users', tone: 'slate', foot: `${db.users.length} comptes au total`, link: '/app/utilisateurs' });
      kpis.push({ label: 'Échecs de connexion (24 h)', value: String(db.audit.filter((log) => log.resultat === 'echec' && log.ressource === 'Session' && new Date(log.date).getTime() > day).length), icon: 'lock', tone: 'folere', foot: 'Tentatives refusées', link: '/app/journaux' });
      const last = db.backups[db.backups.length - 1];
      kpis.push({ label: 'Dernière sauvegarde', value: last ? new Date(last.date).toLocaleDateString('fr-FR') : 'Aucune', icon: 'database', tone: last ? 'okok' : 'crust', foot: last ? (last.testeOk ? 'Restauration testée' : 'Restauration non testée') : 'À lancer aujourd’hui', link: '/app/administration' });
      kpis.push({ label: 'Intégrité du journal', value: this.store.verifyAuditChain().ok ? 'Intacte' : 'Altérée', icon: 'shield', tone: 'okok', foot: `${db.audit.length} traces chaînées` });
    }
    return kpis.slice(0, 4);
  }

  get showSalesChart(): boolean {
    return this.auth.can('ventes:superviser') || this.auth.can('ventes:rapport');
  }

  get bars(): DayBar[] {
    const days: DayBar[] = [];
    for (let offset = 13; offset >= 0; offset--) {
      const sales = this.salesOn(offset);
      const date = new Date();
      date.setDate(date.getDate() - offset);
      days.push({
        label: date.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
        date: date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
        total: this.sum(sales),
        tickets: sales.length,
        height: 0,
        today: offset === 0
      });
    }
    const max = Math.max(...days.map((day) => day.total), 1);
    const scale = this.niceMax(max);
    days.forEach((day) => (day.height = (day.total / scale) * 100));
    return days;
  }

  get axis(): number[] {
    const max = this.niceMax(Math.max(...this.bars.map((bar) => bar.total), 1));
    return [max, (max * 3) / 4, max / 2, max / 4, 0];
  }

  get fortnightTotal(): number {
    return this.bars.reduce((sum, bar) => sum + bar.total, 0);
  }

  get topProducts(): { libelle: string; quantite: number; share: number }[] {
    const counts = new Map<string, { libelle: string; quantite: number }>();
    this.store.state.sales
      .filter((sale) => sale.statut !== 'annulee' && Date.now() - new Date(sale.date).getTime() < 7 * 86400000)
      .forEach((sale) => sale.lignes.forEach((line) => {
        const current = counts.get(line.productId) || { libelle: line.libelle, quantite: 0 };
        current.quantite += line.quantite;
        counts.set(line.productId, current);
      }));
    const sorted = Array.from(counts.values()).sort((a, b) => b.quantite - a.quantite).slice(0, 5);
    const max = sorted.length ? sorted[0].quantite : 1;
    return sorted.map((item) => ({ ...item, share: (item.quantite / max) * 100 }));
  }

  get alerts(): Product[] {
    return this.store.state.products
      .filter((product) => product.actif && product.stock <= product.seuil)
      .filter((product) => this.auth.can('stocks:lire') || product.type === 'fini')
      .sort((a, b) => a.stock / Math.max(a.seuil, 1) - b.stock / Math.max(b.seuil, 1));
  }

  get pipeline(): { label: string; status: PurchaseOrder['statut']; count: number; amount: number }[] {
    const steps: { label: string; status: PurchaseOrder['statut'] }[] = [
      { label: 'Brouillons', status: 'brouillon' },
      { label: 'En validation', status: 'en_validation' },
      { label: 'À livrer', status: 'approuvee' },
      { label: 'Livrées', status: 'livree' }
    ];
    return steps.map((step) => {
      const orders = this.ordersIn(step.status);
      return { ...step, count: orders.length, amount: orders.reduce((sum, order) => sum + order.total, 0) };
    });
  }

  get recentActivity(): AuditLog[] {
    const all = this.store.state.audit;
    const scoped = this.auth.can('journaux:technique') || this.auth.can('journaux:synthese')
      ? all
      : all.filter((log) => log.userId === this.auth.user!.id);
    return scoped.slice(-6).reverse();
  }

  get pendingValidations(): number {
    const db = this.store.state;
    let count = 0;
    if (this.auth.can('achats:valider')) { count += this.ordersIn('en_validation').length; }
    if (this.auth.can('stocks:valider')) { count += db.movements.filter((movement) => movement.statut === 'en_attente').length; }
    if (this.auth.can('tresorerie:valider')) {
      count += db.paymentRequests.filter((request) => request.statut === 'en_validation').length + db.budgets.filter((budget) => budget.statut === 'propose').length;
    }
    if (this.auth.can('ventes:superviser')) { count += db.sales.filter((sale) => sale.statut === 'annulation_demandee').length; }
    return count;
  }

  get draftEntries(): number {
    return this.store.state.entries.filter((entry) => entry.statut === 'brouillon').length;
  }

  barTitle(bar: DayBar): string {
    return `${bar.date} : ${this.format(bar.total)} FCFA, ${bar.tickets} tickets`;
  }

  axisLabel(value: number): string {
    return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value);
  }

  private get todaySales(): Sale[] {
    return this.salesOn(0);
  }

  private salesOn(offset: number): Sale[] {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = date.toDateString();
    return this.store.state.sales.filter((sale) => sale.statut !== 'annulee' && new Date(sale.date).toDateString() === key);
  }

  private ordersIn(status: PurchaseOrder['statut']): PurchaseOrder[] {
    return this.store.state.orders.filter((order) => order.statut === status);
  }

  private sum(sales: Sale[]): number {
    return sales.reduce((total, sale) => total + sale.total, 0);
  }

  private format(value: number): string {
    return new Intl.NumberFormat('fr-FR').format(value).replace(/ /g, ' ');
  }

  private niceMax(value: number): number {
    const magnitude = 10 ** Math.floor(Math.log10(value));
    const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    const normalized = value / magnitude;
    const step = steps.find((candidate) => candidate >= normalized) || 10;
    return step * magnitude;
  }
}
