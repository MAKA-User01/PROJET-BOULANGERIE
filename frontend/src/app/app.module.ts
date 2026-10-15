import { LOCALE_ID, NgModule } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { BrowserModule } from '@angular/platform-browser';
import { RouterModule, Routes } from '@angular/router';

import { AppComponent } from './app.component';
import { AuthGuard, GuestGuard } from './core/guards';
import { Permission } from './core/models';
import { NAVIGATION } from './core/rbac';
import { ShellComponent } from './layout/shell.component';
import { AccessDeniedComponent } from './pages/access-denied/access-denied.component';
import { AccountingComponent } from './pages/accounting/accounting.component';
import { AdministrationComponent } from './pages/administration/administration.component';
import { AuditComponent } from './pages/audit/audit.component';
import { CashComponent } from './pages/cash/cash.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { LoginComponent } from './pages/login/login.component';
import { ProductsComponent } from './pages/products/products.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { PurchasesComponent } from './pages/purchases/purchases.component';
import { SalesComponent } from './pages/sales/sales.component';
import { StockComponent } from './pages/stock/stock.component';
import { TreasuryComponent } from './pages/treasury/treasury.component';
import { UsersComponent } from './pages/users/users.component';
import { ValidationsComponent } from './pages/validations/validations.component';
import { SharedModule } from './shared/shared.module';

registerLocaleData(localeFr);

/** Les permissions exigées par chaque route proviennent de la même source que la navigation. */
function secured(path: string, component: unknown): Routes[number] {
  const item = NAVIGATION.flatMap((section) => section.items).find((candidate) => candidate.path === path);
  const permissions: Permission[] = item ? item.any : [];
  return { path, component: component as Routes[number]['component'], data: { permissions, ressource: item?.label || path } };
}

const routes: Routes = [
  { path: 'connexion', component: LoginComponent, canActivate: [GuestGuard] },
  {
    path: 'app',
    component: ShellComponent,
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    children: [
      secured('tableau-de-bord', DashboardComponent),
      secured('caisse', CashComponent),
      secured('ventes', SalesComponent),
      secured('validations', ValidationsComponent),
      secured('produits', ProductsComponent),
      secured('stocks', StockComponent),
      secured('achats', PurchasesComponent),
      secured('tresorerie', TreasuryComponent),
      secured('comptabilite', AccountingComponent),
      secured('utilisateurs', UsersComponent),
      secured('journaux', AuditComponent),
      secured('administration', AdministrationComponent),
      { path: 'profil', component: ProfileComponent },
      { path: 'acces-refuse', component: AccessDeniedComponent },
      { path: '', pathMatch: 'full', redirectTo: 'tableau-de-bord' }
    ]
  },
  { path: '', pathMatch: 'full', redirectTo: 'app/tableau-de-bord' },
  { path: '**', redirectTo: 'app/tableau-de-bord' }
];

@NgModule({
  declarations: [
    AppComponent, ShellComponent, LoginComponent, DashboardComponent, CashComponent, SalesComponent, ValidationsComponent,
    ProductsComponent, StockComponent, PurchasesComponent, TreasuryComponent, AccountingComponent, UsersComponent,
    AuditComponent, AdministrationComponent, ProfileComponent, AccessDeniedComponent
  ],
  imports: [BrowserModule, SharedModule, RouterModule.forRoot(routes, { scrollPositionRestoration: 'top' })],
  providers: [{ provide: LOCALE_ID, useValue: 'fr-FR' }],
  bootstrap: [AppComponent]
})
export class AppModule {}
