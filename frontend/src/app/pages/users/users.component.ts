import { Component } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { Permission, RoleId, User } from '../../core/models';
import { ASSIGNABLE_ROLES, PERMISSION_LABELS, RoleDefinition, roleOf, ROLES } from '../../core/rbac';
import { UsersService } from '../../core/users.service';

@Component({
  selector: 'tm-users',
  templateUrl: './users.component.html',
  styles: [`
    .role-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .role-option { display: flex; align-items: flex-start; gap: 10px; padding: 12px; border: 1.5px solid var(--line); border-radius: 14px; background: var(--surface); text-align: left; }
    .role-option strong { display: block; font-size: 13.5px; }
    .role-option small { display: block; margin-top: 2px; color: var(--ink-400); font-size: 12px; line-height: 1.35; }
    .role-option .demo-dot { width: 10px; height: 10px; flex: 0 0 auto; margin-top: 4px; border-radius: 50%; background: var(--tone); }
    .role-option.is-active { border-color: var(--tone); background: var(--tone-soft); }
    .role-option:disabled { opacity: .45; cursor: not-allowed; }
    .credentials { padding: 20px; border: 1.5px dashed var(--crust-300); border-radius: 18px; background: var(--crust-50); text-align: center; }
    .credentials .mono { display: block; margin-top: 6px; font-size: 22px; font-weight: 700; letter-spacing: .06em; }
    .matrix th, .matrix td { text-align: center; }
    .matrix th:first-child, .matrix td:first-child { text-align: left; }
    .yes { color: var(--okok-500); } .no { color: var(--ink-300); }
    @media (max-width: 640px) { .role-options { grid-template-columns: 1fr; } }
  `]
})
export class UsersComponent {
  tab: 'comptes' | 'matrice' = 'comptes';
  search = '';
  form: { prenom: string; nom: string; identifiant: string; role: RoleId; telephone: string } | null = null;
  roleChange: { user: User; role: RoleId; justification: string } | null = null;
  credentials: { user: string; identifiant: string; password: string } | null = null;
  identifiantTouched = false;
  readonly roles = ROLES;
  readonly assignable = ASSIGNABLE_ROLES;
  readonly permissions = Object.keys(PERMISSION_LABELS) as Permission[];
  readonly permissionLabels = PERMISSION_LABELS;

  constructor(readonly auth: AuthService, readonly usersService: UsersService) {}

  get users(): User[] {
    const query = this.search.trim().toLowerCase();
    return this.usersService.users.filter((user) => !query || `${user.prenom} ${user.nom} ${user.identifiant} ${roleOf(user.role).label}`.toLowerCase().includes(query));
  }

  get canManage(): boolean {
    return this.auth.can('utilisateurs:gerer');
  }

  role(id: RoleId): RoleDefinition {
    return roleOf(id);
  }

  isSelf(user: User): boolean {
    return user.id === this.auth.user?.id;
  }

  isPrivileged(user: User): boolean {
    return roleOf(user.role).privileged;
  }

  initials(user: User): string {
    return `${user.prenom.charAt(0)}${user.nom.charAt(0)}`.toUpperCase();
  }

  openCreate(): void {
    this.identifiantTouched = false;
    this.form = { prenom: '', nom: '', identifiant: '', role: 'caissier', telephone: '' };
  }

  suggest(): void {
    if (this.form && !this.identifiantTouched) {
      this.form.identifiant = this.usersService.suggestIdentifiant(this.form.prenom, this.form.nom);
    }
  }

  create(): void {
    if (!this.form) {
      return;
    }
    const password = this.usersService.create(this.form);
    if (password) {
      this.credentials = { user: `${this.form.prenom} ${this.form.nom}`, identifiant: this.form.identifiant.trim().toLowerCase(), password };
      this.form = null;
    }
  }

  openRoleChange(user: User): void {
    this.roleChange = { user, role: user.role, justification: '' };
  }

  applyRoleChange(): void {
    if (this.roleChange && this.usersService.changeRole(this.roleChange.user, this.roleChange.role, this.roleChange.justification)) {
      this.roleChange = null;
    }
  }

  reset(user: User): void {
    const password = this.usersService.resetPassword(user);
    if (password) {
      this.credentials = { user: `${user.prenom} ${user.nom}`, identifiant: user.identifiant, password };
    }
  }

  print(): void {
    window.print();
  }

  has(role: RoleDefinition, permission: Permission): boolean {
    return role.permissions.includes(permission);
  }
}
