import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { generateTemporaryPassword, hashPassword, randomToken } from './crypto';
import { RoleId, User } from './models';
import { ASSIGNABLE_ROLES, roleOf } from './rbac';
import { StoreService } from './store.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class UsersService {
  constructor(private readonly store: StoreService, private readonly auth: AuthService, private readonly toast: ToastService) {}

  get users(): User[] {
    return [...this.store.state.users].sort((a, b) => a.nom.localeCompare(b.nom));
  }

  isLocked(user: User): boolean {
    const attempt = this.store.state.loginAttempts[user.identifiant];
    return !!attempt?.lockedUntil && new Date(attempt.lockedUntil).getTime() > Date.now();
  }

  suggestIdentifiant(prenom: string, nom: string): string {
    const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
    const base = `${normalize(prenom).charAt(0)}.${normalize(nom)}`;
    if (base.length < 3) {
      return '';
    }
    let candidate = base;
    let index = 2;
    while (this.store.state.users.some((user) => user.identifiant === candidate)) {
      candidate = `${base}${index++}`;
    }
    return candidate;
  }

  /** Création d'un compte métier par le Manager (§3.2) : renvoie le mot de passe provisoire à remettre. */
  create(draft: { prenom: string; nom: string; identifiant: string; role: RoleId; telephone: string }): string | null {
    if (!this.auth.require('utilisateurs:gerer', 'Utilisateurs & rôles', 'création de compte')) {
      return null;
    }
    const identifiant = draft.identifiant.trim().toLowerCase();
    if (!draft.prenom.trim() || !draft.nom.trim()) {
      this.toast.error('Informations manquantes', 'Le prénom et le nom sont obligatoires.');
      return null;
    }
    if (!/^[a-z][a-z0-9._-]{2,30}$/.test(identifiant)) {
      this.toast.error('Identifiant invalide', '3 à 31 caractères : lettres minuscules, chiffres, point, tiret.');
      return null;
    }
    if (this.store.state.users.some((user) => user.identifiant === identifiant)) {
      this.auth.trace('Création de compte refusée', 'Utilisateurs & rôles', 'echec', { objet: identifiant, motif: 'Identifiant déjà utilisé' });
      this.toast.error('Identifiant déjà utilisé', 'Chaque compte doit avoir un identifiant unique.');
      return null;
    }
    if (!ASSIGNABLE_ROLES.includes(draft.role)) {
      this.auth.trace('Attribution de rôle privilégié bloquée', 'Utilisateurs & rôles', 'refus', { objet: identifiant, details: `Rôle demandé : ${roleOf(draft.role).label}` });
      this.toast.error('Rôle non attribuable', 'Les rôles Manager et Administrateur suivent une procédure renforcée.');
      return null;
    }
    const temporary = generateTemporaryPassword();
    const salt = randomToken(12);
    const user: User = {
      id: this.store.uid('u'), prenom: draft.prenom.trim(), nom: draft.nom.trim(), identifiant, role: draft.role,
      actif: true, salt, passwordHash: hashPassword(temporary, salt), mustChangePassword: true,
      telephone: draft.telephone.trim() || undefined, creeLe: new Date().toISOString(), creePar: this.auth.user!.id
    };
    this.store.commit((db) => db.users.push(user));
    this.auth.trace('Création de compte et attribution de rôle', 'Utilisateurs & rôles', 'succes', {
      objet: identifiant, details: `Rôle attribué : ${roleOf(draft.role).label}`
    });
    this.toast.success('Compte créé', `${user.prenom} ${user.nom} · ${roleOf(user.role).label}`);
    return temporary;
  }

  changeRole(user: User, role: RoleId, justification: string): boolean {
    if (!this.auth.require('utilisateurs:gerer', 'Utilisateurs & rôles', 'changement de rôle')) {
      return false;
    }
    if (user.id === this.auth.user?.id) {
      this.auth.trace('Auto-attribution de rôle bloquée', 'Utilisateurs & rôles', 'refus', { objet: user.identifiant, details: `Rôle demandé : ${roleOf(role).label}` });
      this.toast.error('Opération interdite', 'Personne ne peut modifier ses propres privilèges.');
      return false;
    }
    if (roleOf(user.role).privileged || !ASSIGNABLE_ROLES.includes(role)) {
      this.auth.trace('Changement de rôle privilégié bloqué', 'Utilisateurs & rôles', 'refus', { objet: user.identifiant, details: `${roleOf(user.role).label} → ${roleOf(role).label}` });
      this.toast.error('Procédure renforcée requise', 'Les rôles privilégiés ne se gèrent pas depuis cet écran.');
      return false;
    }
    if (!justification.trim()) {
      this.toast.error('Justification requise', 'Précisez la raison du changement de rôle.');
      return false;
    }
    const before = user.role;
    this.store.commit(() => (user.role = role));
    this.auth.trace('Changement de rôle', 'Utilisateurs & rôles', 'succes', {
      objet: user.identifiant, details: `Ancien rôle : ${roleOf(before).label} → nouveau rôle : ${roleOf(role).label}`, motif: justification
    });
    this.toast.success('Rôle modifié', `${user.prenom} ${user.nom} est désormais ${roleOf(role).label}.`);
    return true;
  }

  setActive(user: User, actif: boolean): void {
    if (!this.auth.require('utilisateurs:gerer', 'Utilisateurs & rôles', actif ? 'réactivation de compte' : 'désactivation de compte')) {
      return;
    }
    if (user.id === this.auth.user?.id || roleOf(user.role).privileged) {
      this.auth.trace('Modification de compte privilégié bloquée', 'Utilisateurs & rôles', 'refus', { objet: user.identifiant });
      this.toast.error('Opération interdite', 'Ce compte relève de la procédure renforcée.');
      return;
    }
    this.store.commit(() => (user.actif = actif));
    this.auth.trace(actif ? 'Réactivation de compte' : 'Désactivation de compte', 'Utilisateurs & rôles', 'succes', { objet: user.identifiant });
    this.toast.success(actif ? 'Compte réactivé' : 'Compte désactivé', `${user.prenom} ${user.nom}`);
  }

  /** Assistance technique tracée : déverrouillage d'un identifiant bloqué. */
  unlock(user: User): void {
    if (!this.auth.require('utilisateurs:assistance', 'Utilisateurs & rôles', 'déverrouillage')) {
      return;
    }
    this.store.commit((db) => delete db.loginAttempts[user.identifiant]);
    this.auth.trace('Déverrouillage de compte (assistance)', 'Utilisateurs & rôles', 'succes', { objet: user.identifiant });
    this.toast.success('Compte déverrouillé', user.identifiant);
  }

  /** Réinitialisation tracée : le Manager pour les comptes métier, l'Administrateur en assistance technique. */
  resetPassword(user: User): string | null {
    const allowed = this.auth.can('utilisateurs:assistance') || (this.auth.can('utilisateurs:gerer') && !roleOf(user.role).privileged);
    if (!allowed) {
      this.auth.require('utilisateurs:assistance', 'Utilisateurs & rôles', 'réinitialisation de mot de passe');
      return null;
    }
    if (user.id === this.auth.user?.id) {
      this.toast.error('Utilisez votre profil', 'Changez votre propre mot de passe depuis « Mon profil ».');
      return null;
    }
    const temporary = generateTemporaryPassword();
    const salt = randomToken(12);
    this.store.commit((db) => {
      user.salt = salt;
      user.passwordHash = hashPassword(temporary, salt);
      user.mustChangePassword = true;
      delete db.loginAttempts[user.identifiant];
    });
    this.auth.trace('Réinitialisation de mot de passe', 'Utilisateurs & rôles', 'succes', { objet: user.identifiant });
    return temporary;
  }
}
