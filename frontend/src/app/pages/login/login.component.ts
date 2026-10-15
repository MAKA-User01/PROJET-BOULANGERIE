import { Component, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth.service';
import { RoleDefinition, roleOf } from '../../core/rbac';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../core/seed';

@Component({
  selector: 'tm-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  @ViewChild('codeInput') codeInput?: ElementRef<HTMLInputElement>;
  @ViewChild('passwordInput') passwordInput?: ElementRef<HTMLInputElement>;

  readonly demo = environment.demo;
  readonly demoPassword = DEMO_PASSWORD;
  readonly demoAccounts: { identifiant: string; role: RoleDefinition }[] = DEMO_ACCOUNTS.map((account) => ({
    identifiant: account.identifiant,
    role: roleOf(account.role)
  }));
  readonly year = new Date().getFullYear();

  step: 'credentials' | 'mfa' = 'credentials';
  identifiant = '';
  password = '';
  code = '';
  demoCode = '';
  showPassword = false;
  capsLock = false;
  loading = false;
  error = '';
  readonly expired: boolean;

  constructor(private readonly auth: AuthService, private readonly router: Router, private readonly route: ActivatedRoute) {
    this.expired = route.snapshot.queryParamMap.get('motif') === 'expiration';
  }

  fill(identifiant: string): void {
    this.identifiant = identifiant;
    this.password = this.demoPassword;
    this.error = '';
  }

  detectCaps(event: KeyboardEvent): void {
    this.capsLock = typeof event.getModifierState === 'function' && event.getModifierState('CapsLock');
  }

  submit(): void {
    if (this.loading) {
      return;
    }
    if (!this.identifiant.trim() || !this.password) {
      this.error = 'Renseignez votre identifiant et votre mot de passe.';
      return;
    }
    this.loading = true;
    this.error = '';
    // Léger délai : rend le retour visuel lisible et freine les essais automatisés.
    setTimeout(() => {
      const outcome = this.auth.login(this.identifiant, this.password);
      this.loading = false;
      if (outcome.status === 'ok') {
        this.enter();
      } else if (outcome.status === 'mfa') {
        this.step = 'mfa';
        this.demoCode = outcome.demoCode;
        this.code = '';
        setTimeout(() => this.codeInput?.nativeElement.focus(), 50);
      } else {
        this.error = outcome.message;
        this.password = '';
        setTimeout(() => this.passwordInput?.nativeElement.focus(), 0);
      }
    }, 450);
  }

  onCodeInput(value: string): void {
    this.code = value.replace(/\D/g, '').slice(0, 6);
    if (this.code.length === 6) {
      this.verify();
    }
  }

  verify(): void {
    if (this.code.length !== 6 || this.loading) {
      return;
    }
    this.loading = true;
    setTimeout(() => {
      const outcome = this.auth.verifyMfa(this.code);
      this.loading = false;
      if (outcome.status === 'ok') {
        this.enter();
        return;
      }
      this.error = outcome.status === 'error' ? outcome.message : '';
      this.code = '';
      if (!this.auth.hasPendingMfa) {
        this.back();
        this.error = outcome.status === 'error' ? outcome.message : '';
      }
    }, 350);
  }

  back(): void {
    this.auth.cancelMfa();
    this.step = 'credentials';
    this.password = '';
    this.code = '';
    this.error = '';
  }

  private enter(): void {
    const target = this.route.snapshot.queryParamMap.get('retour');
    if (this.auth.user?.mustChangePassword) {
      this.router.navigate(['/app/profil'], { queryParams: { premiere: 1 } });
    } else {
      this.router.navigateByUrl(target && target.startsWith('/app') ? target : '/app/tableau-de-bord');
    }
  }
}
