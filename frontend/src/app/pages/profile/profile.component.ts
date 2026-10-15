import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { passwordIssues } from '../../core/crypto';
import { Permission } from '../../core/models';
import { PERMISSION_LABELS, RoleDefinition, roleOf } from '../../core/rbac';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'tm-profile',
  templateUrl: './profile.component.html',
  styles: [`
    .identity { display: flex; align-items: center; gap: 18px; }
    .rules { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px 14px; margin: 0; padding: 0; list-style: none; }
    .rules li { display: flex; align-items: center; gap: 6px; color: var(--ink-400); font-size: 12.5px; font-weight: 600; }
    .rules li.ok { color: var(--okok-700); }
    .rules .icon { width: 14px; height: 14px; }
    .perm-list { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
    .perm-list li { display: flex; align-items: center; gap: 10px; font-size: 13.5px; }
    .perm-list .icon { width: 16px; height: 16px; color: var(--okok-500); }
  `]
})
export class ProfileComponent {
  current = '';
  next = '';
  confirm = '';
  show = false;
  error = '';
  readonly firstLogin: boolean;
  readonly rules = [
    { label: '10 caractères', test: (value: string) => value.length >= 10 },
    { label: 'Une majuscule', test: (value: string) => /[A-Z]/.test(value) },
    { label: 'Une minuscule', test: (value: string) => /[a-z]/.test(value) },
    { label: 'Un chiffre', test: (value: string) => /[0-9]/.test(value) },
    { label: 'Un caractère spécial', test: (value: string) => /[^A-Za-z0-9]/.test(value) }
  ];

  constructor(readonly auth: AuthService, private readonly toast: ToastService, private readonly router: Router, route: ActivatedRoute) {
    this.firstLogin = route.snapshot.queryParamMap.has('premiere') || !!auth.user?.mustChangePassword;
  }

  get role(): RoleDefinition {
    return roleOf(this.auth.user!.role);
  }

  get permissions(): string[] {
    return this.role.permissions.map((permission: Permission) => PERMISSION_LABELS[permission]);
  }

  get initials(): string {
    return `${this.auth.user!.prenom.charAt(0)}${this.auth.user!.nom.charAt(0)}`.toUpperCase();
  }

  get valid(): boolean {
    return passwordIssues(this.next).length === 0 && this.next === this.confirm && !!this.current;
  }

  submit(): void {
    if (this.next !== this.confirm) {
      this.error = 'La confirmation ne correspond pas au nouveau mot de passe.';
      return;
    }
    const error = this.auth.changePassword(this.current, this.next);
    if (error) {
      this.error = error;
      return;
    }
    this.error = '';
    this.current = this.next = this.confirm = '';
    this.toast.success('Mot de passe mis à jour', 'Il est désormais strictement personnel.');
    if (this.firstLogin) {
      this.router.navigate(['/app/tableau-de-bord']);
    }
  }
}
