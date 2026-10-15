import { Injectable } from '@angular/core';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  toasts: Toast[] = [];
  private counter = 0;

  success(title: string, message?: string): void {
    this.push('success', title, message);
  }

  error(title: string, message?: string): void {
    this.push('error', title, message);
  }

  info(title: string, message?: string): void {
    this.push('info', title, message);
  }

  dismiss(id: number): void {
    this.toasts = this.toasts.filter((toast) => toast.id !== id);
  }

  private push(tone: ToastTone, title: string, message?: string): void {
    const toast: Toast = { id: ++this.counter, tone, title, message };
    this.toasts = [...this.toasts.slice(-3), toast];
    setTimeout(() => this.dismiss(toast.id), tone === 'error' ? 6000 : 4200);
  }
}
