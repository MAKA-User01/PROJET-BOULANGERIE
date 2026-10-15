import { Component } from '@angular/core';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})
export class AppComponent {
  constructor(readonly toast: ToastService) {}
}
