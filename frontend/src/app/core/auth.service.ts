import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { hashPassword, passwordIssues, randomToken } from './crypto';
import { AuditResult, Permission, User } from './models';
import { hasPermission, roleOf } from './rbac';
import { StoreService } from './store.service';
import { ToastService } from './toast.service';

const SESSION_KEY = 'tammak.session';
const GENERIC_ERROR = 'Identifiant ou mot de passe incorrect.';

export type LoginOutcome =
  | { status: 'ok' }
  | { status: 'mfa'; demoCode: string }
  | { status: 'error'; message: string };

interface PendingMfa {
  userId: string;
  code: string;
  expiresAt: number;
  attempts: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  user: User | null = null;
  secondsBeforeExpiry: number | null = null;
  private pendingMfa: PendingMfa | null = null;
  private lastActivity = Date.now();

  constructor(
    private readonly store: StoreService,
    private readonly router: Router,
    private readonly toast: ToastService,
    private readonly zone: NgZone
  ) {
    this.restoreSession();
    this.watchActivity();
  }

  get isAuthenticated(): boolean {
    return this.user !== null;
  }

  get hasPendingMfa(): boolean {
    return this.pendingMfa !== null && this.pendingMfa.expiresAt > Date.now();
  }

  can(permission: Permission): boolean {
    return hasPermission(this.user?.role, permission);
  }

  canAny(permissions: Permission[]): boolean {
    return permissions.length === 0 ? this.isAuthenticated : permissions.some((permission) => this.can(permission));
  }

  /** Contrôle d'autorisation systématique avant chaque action sensible (refus par défaut + traçage). */
  require(permission: Permission, ressource: string, action: string): boolean {
    if (this.can(permission)) {
      return true;
    }
    this.trace(`Action refusée : ${action}`, ressource, 'refus', { motif: `Permission ${permission} absente du rôle` });
    this.toast.error('Action non autorisée', 'Votre rôle ne permet pas cette opération. La tentative a été journalisée.');
    return false;
  }

  trace(action: string, ressource: string, resultat: AuditResult, extra: { objet?: string; motif?: string; details?: string } = {}): void {
    this.store.appendAudit({
      userId: this.user?.id,
      identifiant: this.user?.identifiant || 'anonyme',
      role: this.user?.role,
      action,
      ressource,
      resultat,
      ...extra
    });
  }

  login(identifiantInput: string, password: string): LoginOutcome {
    const identifiant = identifiantInput.trim().toLowerCase();
    const settings = this.store.state.settings;
    const attempt = this.store.state.loginAttempts[identifiant];

    if (attempt?.lockedUntil && new Date(attempt.lockedUntil).getTime() > Date.now()) {
      const minutes = Math.ceil((new Date(attempt.lockedUntil).getTime() - Date.now()) / 60000);
      this.store.appendAudit({ identifiant, action: 'Connexion bloquée (verrouillage actif)', ressource: 'Session', resultat: 'refus' });
      return { status: 'error', message: `Trop de tentatives. Réessayez dans ${minutes} min ou contactez l’administrateur.` };
    }

    const user = this.store.state.users.find((candidate) => candidate.identifiant === identifiant);
    const valid = !!user && user.actif && hashPassword(password, user.salt) === user.passwordHash;

    if (!valid || !user) {
      const count = (attempt?.count || 0) + 1;
      const locked = count >= settings.maxTentatives;
      this.store.commit((db) => {
        db.loginAttempts[identifiant] = {
          count: locked ? 0 : count,
          lockedUntil: locked ? new Date(Date.now() + settings.verrouillageMin * 60000).toISOString() : undefined
        };
      });
      this.store.appendAudit({
        userId: user?.id,
        identifiant,
        action: locked ? 'Échec de connexion — identifiant verrouillé' : 'Échec de connexion',
        ressource: 'Session',
        resultat: 'echec',
        motif: user && !user.actif ? 'Compte désactivé' : 'Identifiants invalides'
      });
      return {
        status: 'error',
        message: locked ? `Trop de tentatives. Accès suspendu pendant ${settings.verrouillageMin} min.` : GENERIC_ERROR
      };
    }

    this.store.commit((db) => delete db.loginAttempts[identifiant]);

    if (settings.mfaPrivilegies && roleOf(user.role).privileged) {
      const code = String(100000 + (parseInt(randomToken(3), 16) % 900000));
      this.pendingMfa = { userId: user.id, code, expiresAt: Date.now() + 5 * 60000, attempts: 0 };
      this.store.appendAudit({ userId: user.id, identifiant, role: user.role, action: 'Mot de passe vérifié — code de vérification envoyé', ressource: 'Session', resultat: 'succes' });
      return { status: 'mfa', demoCode: code };
    }

    this.openSession(user);
    return { status: 'ok' };
  }

  verifyMfa(code: string): LoginOutcome {
    const pending = this.pendingMfa;
    if (!pending || pending.expiresAt < Date.now()) {
      this.pendingMfa = null;
      return { status: 'error', message: 'Le code a expiré. Reconnectez-vous.' };
    }
    const user = this.store.state.users.find((candidate) => candidate.id === pending.userId);
    if (!user) {
      this.pendingMfa = null;
      return { status: 'error', message: GENERIC_ERROR };
    }
    if (code.trim() !== pending.code) {
      pending.attempts++;
      this.store.appendAudit({ userId: user.id, identifiant: user.identifiant, role: user.role, action: 'Code de vérification invalide', ressource: 'Session', resultat: 'echec' });
      if (pending.attempts >= 3) {
        this.pendingMfa = null;
        return { status: 'error', message: 'Trop de codes invalides. Reconnectez-vous.' };
      }
      return { status: 'error', message: `Code invalide. ${3 - pending.attempts} essai(s) restant(s).` };
    }
    this.pendingMfa = null;
    this.openSession(user);
    return { status: 'ok' };
  }

  cancelMfa(): void {
    this.pendingMfa = null;
  }

  logout(reason: 'manuel' | 'expiration' = 'manuel'): void {
    if (this.user) {
      this.trace(reason === 'expiration' ? 'Expiration de session (inactivité)' : 'Déconnexion', 'Session', 'succes');
    }
    this.user = null;
    this.secondsBeforeExpiry = null;
    sessionStorage.removeItem(SESSION_KEY);
    this.router.navigate(['/connexion'], { queryParams: reason === 'expiration' ? { motif: 'expiration' } : {} });
  }

  changePassword(current: string, next: string): string | null {
    const user = this.user;
    if (!user) {
      return 'Session expirée.';
    }
    if (hashPassword(current, user.salt) !== user.passwordHash) {
      this.trace('Changement de mot de passe', 'Profil', 'echec', { motif: 'Mot de passe actuel incorrect' });
      return 'Le mot de passe actuel est incorrect.';
    }
    const issues = passwordIssues(next);
    if (issues.length) {
      return `Le nouveau mot de passe doit contenir : ${issues.join(', ')}.`;
    }
    if (current === next) {
      return 'Le nouveau mot de passe doit être différent de l’actuel.';
    }
    const salt = randomToken(12);
    this.store.commit((db) => {
      const target = db.users.find((candidate) => candidate.id === user.id);
      if (target) {
        target.salt = salt;
        target.passwordHash = hashPassword(next, salt);
        target.mustChangePassword = false;
        this.user = target;
      }
    });
    this.trace('Changement de mot de passe', 'Profil', 'succes');
    return null;
  }

  touch(): void {
    this.lastActivity = Date.now();
    if (this.user) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId: this.user.id, lastActivity: this.lastActivity }));
    }
  }

  private openSession(user: User): void {
    this.store.commit((db) => {
      const target = db.users.find((candidate) => candidate.id === user.id);
      if (target) {
        target.derniereConnexion = new Date().toISOString();
      }
    });
    this.user = this.store.state.users.find((candidate) => candidate.id === user.id) || null;
    this.trace('Connexion', 'Session', 'succes');
    this.touch();
  }

  private restoreSession(): void {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) {
        return;
      }
      const session = JSON.parse(raw) as { userId: string; lastActivity: number };
      const timeout = this.store.state.settings.sessionTimeoutMin * 60000;
      const user = this.store.state.users.find((candidate) => candidate.id === session.userId);
      if (user && user.actif && Date.now() - session.lastActivity < timeout) {
        this.user = user;
        this.lastActivity = session.lastActivity;
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  private watchActivity(): void {
    this.zone.runOutsideAngular(() => {
      let lastWrite = 0;
      const onActivity = () => {
        if (!this.user) {
          return;
        }
        const now = Date.now();
        if (this.secondsBeforeExpiry !== null) {
          this.zone.run(() => (this.secondsBeforeExpiry = null));
        }
        this.lastActivity = now;
        if (now - lastWrite > 5000) {
          lastWrite = now;
          this.touch();
        }
      };
      ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((event) =>
        document.addEventListener(event, onActivity, { passive: true })
      );

      setInterval(() => {
        if (!this.user) {
          return;
        }
        const current = this.store.state.users.find((candidate) => candidate.id === this.user?.id);
        if (!current || !current.actif) {
          this.zone.run(() => this.logout('manuel'));
          return;
        }
        const timeout = this.store.state.settings.sessionTimeoutMin * 60000;
        const remaining = Math.round((timeout - (Date.now() - this.lastActivity)) / 1000);
        if (remaining <= 0) {
          this.zone.run(() => this.logout('expiration'));
        } else if (remaining <= 60) {
          this.zone.run(() => (this.secondsBeforeExpiry = remaining));
        }
      }, 1000);
    });
  }
}
