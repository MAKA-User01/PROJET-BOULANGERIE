import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { roleOf } from '../../core/rbac';

@Component({
  selector: 'tm-access-denied',
  template: `
    <div class="page denied">
      <div class="denied-card card">
        <span class="denied-icon"><svg tmIcon="lock"></svg></span>
        <p class="eyebrow">Accès refusé</p>
        <h1 class="page-title">Cette porte <em>reste fermée.</em></h1>
        <p class="page-lead">Votre rôle <strong>{{ roleLabel }}</strong> ne donne pas accès à « {{ page }} ». La tentative a été enregistrée dans le journal d’audit.</p>
        <div class="row mt-lg" style="justify-content: center">
          <a class="btn btn-primary" routerLink="/app/tableau-de-bord"><svg tmIcon="arrow-left"></svg> Retour au tableau de bord</a>
          <a class="btn btn-outline" routerLink="/app/profil">Voir mes permissions</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .denied { display: grid; place-items: center; min-height: calc(100vh - 68px); }
    .denied-card { max-width: 560px; padding: 44px; text-align: center; }
    .denied-card .page-lead { margin: 12px auto 0; }
    .denied-card .eyebrow::before { display: none; }
    .denied-icon { width: 72px; height: 72px; display: grid; place-items: center; margin: 0 auto 20px; border-radius: 24px; background: var(--danger-50); color: var(--danger-500); }
    .denied-icon .icon { width: 32px; height: 32px; }
  `]
})
export class AccessDeniedComponent {
  readonly page: string;
  readonly roleLabel: string;

  constructor(route: ActivatedRoute, auth: AuthService) {
    this.page = route.snapshot.queryParamMap.get('page') || 'cette page';
    this.roleLabel = auth.user ? roleOf(auth.user.role).label : '';
  }
}
