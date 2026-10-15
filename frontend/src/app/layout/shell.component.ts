import { Component, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AuthService } from '../core/auth.service';
import { NavItem, NavSection, NAVIGATION, roleOf, RoleDefinition } from '../core/rbac';
import { StoreService } from '../core/store.service';

@Component({
  selector: 'tm-shell',
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.scss']
})
export class ShellComponent implements OnDestroy {
  navOpen = false;
  menuOpen = false;
  currentPath = '';
  readonly today = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  private readonly subscription: Subscription;

  constructor(readonly auth: AuthService, private readonly store: StoreService, private readonly router: Router) {
    this.currentPath = this.extractPath(router.url);
    this.subscription = router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      this.currentPath = this.extractPath(router.url);
      this.navOpen = false;
      this.menuOpen = false;
    });
  }

  get role(): RoleDefinition {
    return roleOf(this.auth.user!.role);
  }

  /** Mémorisé par rôle : recréer les liens à chaque cycle relancerait sans fin routerLinkActive. */
  get sections(): NavSection[] {
    const role = this.auth.user!.role;
    if (this.sectionsCache?.role !== role) {
      this.sectionsCache = { role, sections: this.computeSections() };
    }
    return this.sectionsCache.sections;
  }

  private sectionsCache?: { role: string; sections: NavSection[] };

  private computeSections(): NavSection[] {
    return NAVIGATION
      .map((section) => ({ ...section, items: section.items.filter((item) => this.auth.canAny(item.any)) }))
      .filter((section) => section.items.length > 0);
  }

  get currentLabel(): string {
    if (this.currentPath === 'profil') {
      return 'Mon profil';
    }
    if (this.currentPath === 'acces-refuse') {
      return 'Accès refusé';
    }
    const item = NAVIGATION.flatMap((section) => section.items).find((candidate) => candidate.path === this.currentPath);
    return item ? item.label : 'Tableau de bord';
  }

  get initials(): string {
    const user = this.auth.user!;
    return `${user.prenom.charAt(0)}${user.nom.charAt(0)}`.toUpperCase();
  }

  badge(item: NavItem): number {
    const db = this.store.state;
    if (item.badge === 'stock') {
      return db.products.filter((product) => product.actif && product.stock <= product.seuil).length;
    }
    if (item.badge === 'validations') {
      let count = 0;
      if (this.auth.can('achats:valider')) { count += db.orders.filter((order) => order.statut === 'en_validation').length; }
      if (this.auth.can('stocks:valider')) { count += db.movements.filter((movement) => movement.statut === 'en_attente').length; }
      if (this.auth.can('tresorerie:valider')) {
        count += db.paymentRequests.filter((request) => request.statut === 'en_validation').length;
        count += db.budgets.filter((budget) => budget.statut === 'propose').length;
      }
      if (this.auth.can('ventes:superviser')) { count += db.sales.filter((sale) => sale.statut === 'annulation_demandee').length; }
      return count;
    }
    return 0;
  }

  stayConnected(): void {
    this.auth.touch();
    this.auth.secondsBeforeExpiry = null;
  }

  logout(): void {
    this.auth.logout();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  private extractPath(url: string): string {
    return url.split('?')[0].replace(/^\/app\/?/, '').split('/')[0];
  }
}
