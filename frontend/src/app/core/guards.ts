import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, CanActivateChild, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { Permission } from './models';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate, CanActivateChild {
  constructor(private readonly auth: AuthService, private readonly router: Router) {}

  canActivate(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
    if (!this.auth.isAuthenticated) {
      return this.router.createUrlTree(['/connexion'], { queryParams: { retour: state.url } });
    }
    return true;
  }

  canActivateChild(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
    const authenticated = this.canActivate(route, state);
    if (authenticated !== true) {
      return authenticated;
    }
    const user = this.auth.user;
    if (user?.mustChangePassword && !state.url.startsWith('/app/profil')) {
      return this.router.createUrlTree(['/app/profil'], { queryParams: { premiere: 1 } });
    }
    const required = (route.data['permissions'] || []) as Permission[];
    if (required.length && !this.auth.canAny(required)) {
      this.auth.trace('Tentative d’accès non autorisé', route.data['ressource'] || state.url, 'refus', {
        objet: state.url,
        motif: `Permissions requises : ${required.join(' ou ')}`
      });
      return this.router.createUrlTree(['/app/acces-refuse'], { queryParams: { page: route.data['ressource'] || state.url } });
    }
    return true;
  }
}

@Injectable({ providedIn: 'root' })
export class GuestGuard implements CanActivate {
  constructor(private readonly auth: AuthService, private readonly router: Router) {}

  canActivate(): boolean | UrlTree {
    return this.auth.isAuthenticated ? this.router.createUrlTree(['/app/tableau-de-bord']) : true;
  }
}
