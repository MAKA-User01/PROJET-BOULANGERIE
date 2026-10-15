import { CommonModule } from '@angular/common';
import {
  Component, Directive, EventEmitter, HostListener, Input, NgModule, OnChanges, OnDestroy, OnInit, Output, Pipe, PipeTransform,
  TemplateRef, ViewContainerRef
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { Permission, RoleId } from '../core/models';
import { roleOf } from '../core/rbac';
import { StoreService } from '../core/store.service';

/** Icône du sprite : `<svg tmIcon="nom">` — le SVG reste dans le template parent et hérite de ses styles. */
@Component({
  selector: 'svg[tmIcon]',
  template: '<svg:use [attr.href]="\'#i-\' + tmIcon"></svg:use>',
  host: { class: 'icon', 'aria-hidden': 'true', focusable: 'false' }
})
export class IconComponent {
  @Input() tmIcon = 'grid';
}

@Component({
  selector: 'tm-logo',
  template: `
    <span class="logo" [class.logo--light]="light">
      <svg class="logo-mark" viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient id="tm-crust" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#e07a2e"/><stop offset="1" stop-color="#a5400f"/>
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="14" fill="url(#tm-crust)"/>
        <path d="M11 17.2C11 14.3 13.3 12 16.2 12h15.6c2.9 0 5.2 2.3 5.2 5.2s-2.3 5.2-5.2 5.2H27.6v12.8a3.6 3.6 0 0 1-7.2 0V22.4h-4.2c-2.9 0-5.2-2.3-5.2-5.2Z" fill="#fdf1dc"/>
        <path d="m16.5 15.2 2.3 3.6M22.8 15.2l2.3 3.6M29.1 15.2l2.3 3.6" stroke="#d9772c" stroke-width="1.7" stroke-linecap="round"/>
        <circle cx="24" cy="38.6" r="1.3" fill="#fbd79a"/>
      </svg>
      <span class="logo-copy" *ngIf="!compact">
        <strong>TAMMAK</strong>
        <small>Boulangerie · Pâtisserie</small>
      </span>
    </span>
  `,
  styles: [`
    .logo { display: inline-flex; align-items: center; gap: 12px; color: var(--ink-900); }
    .logo--light { color: #fbf1e3; }
    .logo-mark { width: 42px; height: 42px; flex: 0 0 auto; filter: drop-shadow(0 6px 14px rgba(196, 87, 27, .35)); }
    .logo-copy { display: flex; flex-direction: column; line-height: 1; }
    .logo-copy strong { font-family: var(--font-display); font-size: 21px; font-weight: 700; letter-spacing: .14em; }
    .logo-copy small { margin-top: 6px; opacity: .6; font-size: 9.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; white-space: nowrap; }
  `]
})
export class LogoComponent {
  @Input() light = false;
  @Input() compact = false;
}

@Component({
  selector: 'tm-modal',
  template: `
    <div class="modal-backdrop" (mousedown)="onBackdrop($event)">
      <section class="modal" [class.modal--wide]="wide" role="dialog" aria-modal="true" [attr.aria-label]="title">
        <header class="modal-header">
          <div>
            <div class="eyebrow" *ngIf="kicker">{{ kicker }}</div>
            <h2 class="modal-title" [style.margin-top.px]="kicker ? 6 : 0">{{ title }}</h2>
            <p class="muted small" *ngIf="subtitle" style="margin-top: 4px">{{ subtitle }}</p>
          </div>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Fermer" (click)="closed.emit()"><svg tmIcon="close"></svg></button>
        </header>
        <div class="modal-body"><ng-content></ng-content></div>
        <footer class="modal-footer" *ngIf="footer"><ng-content select="[modal-footer]"></ng-content></footer>
      </section>
    </div>
  `
})
export class ModalComponent {
  @Input() title = '';
  @Input() kicker = '';
  @Input() subtitle = '';
  @Input() wide = false;
  @Input() footer = true;
  @Output() readonly closed = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }
}

@Component({
  selector: 'tm-empty',
  template: `
    <div class="empty">
      <span class="empty-icon"><svg [tmIcon]="icon"></svg></span>
      <strong>{{ title }}</strong>
      <span class="small">{{ text }}</span>
      <ng-content></ng-content>
    </div>
  `
})
export class EmptyStateComponent {
  @Input() icon = 'sparkle';
  @Input() title = '';
  @Input() text = '';
}

/** Affiche un bloc uniquement si le rôle connecté possède l'une des permissions (complément d'ergonomie, pas de sécurité). */
@Directive({ selector: '[tmCan]' })
export class CanDirective implements OnChanges, OnInit, OnDestroy {
  @Input() tmCan: Permission | Permission[] = [];
  private shown = false;
  private subscription?: Subscription;

  constructor(
    private readonly template: TemplateRef<unknown>,
    private readonly container: ViewContainerRef,
    private readonly auth: AuthService,
    private readonly store: StoreService
  ) {}

  ngOnInit(): void {
    this.subscription = this.store.changes$.subscribe(() => this.render());
  }

  ngOnChanges(): void {
    this.render();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private render(): void {
    const permissions = Array.isArray(this.tmCan) ? this.tmCan : [this.tmCan];
    const allowed = this.auth.canAny(permissions);
    if (allowed && !this.shown) {
      this.container.createEmbeddedView(this.template);
      this.shown = true;
    } else if (!allowed && this.shown) {
      this.container.clear();
      this.shown = false;
    }
  }
}

@Pipe({ name: 'fcfa' })
export class FcfaPipe implements PipeTransform {
  private readonly formatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

  transform(value: number | null | undefined, suffix = true): string {
    const formatted = this.formatter.format(value || 0).replace(/ |\s/g, ' ');
    return suffix ? `${formatted} FCFA` : formatted;
  }
}

@Pipe({ name: 'userName' })
export class UserNamePipe implements PipeTransform {
  constructor(private readonly store: StoreService) {}

  transform(userId: string | undefined, format: 'full' | 'initials' = 'full'): string {
    if (!userId) {
      return '—';
    }
    if (userId === 'systeme') {
      return format === 'initials' ? 'SY' : 'Système';
    }
    const user = this.store.state.users.find((candidate) => candidate.id === userId);
    if (!user) {
      return 'Compte inconnu';
    }
    return format === 'initials' ? `${user.prenom.charAt(0)}${user.nom.charAt(0)}`.toUpperCase() : `${user.prenom} ${user.nom}`;
  }
}

@Pipe({ name: 'role' })
export class RolePipe implements PipeTransform {
  transform(role: RoleId | undefined, field: 'label' | 'tone' = 'label'): string {
    if (!role) {
      return field === 'tone' ? 'slate' : '—';
    }
    return roleOf(role)[field];
  }
}

@Pipe({ name: 'relative' })
export class RelativeDatePipe implements PipeTransform {
  transform(value: string | undefined): string {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === today.toDateString()) {
      return `Aujourd’hui · ${time}`;
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return `Hier · ${time}`;
    }
    return `${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${time}`;
  }
}

const DECLARATIONS = [
  IconComponent, LogoComponent, ModalComponent, EmptyStateComponent, CanDirective, FcfaPipe, UserNamePipe, RolePipe, RelativeDatePipe
];

@NgModule({
  declarations: DECLARATIONS,
  imports: [CommonModule],
  exports: [...DECLARATIONS, CommonModule, FormsModule, RouterModule]
})
export class SharedModule {}
