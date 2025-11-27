import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { hlm } from '@spartan-ng/helm/utils';
import type { ClassValue } from 'clsx';

import { SidebarHeaderComponent } from '../sidebar-header/sidebar-header.component';
import { RbthSidebarLayoutModule, SidebarService } from '@rabbithole/ui';
import { HlmSeparator } from '@spartan-ng/helm/separator';

@Component({
  selector: 'app-sidebar-layout',
  imports: [
    RbthSidebarLayoutModule,
    SidebarHeaderComponent,
    RouterOutlet,
    HlmSeparator,
  ],
  templateUrl: './sidebar.component.html',
  host: {
    '[class]': 'hostClass()',
  },
  providers: [SidebarService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarLayoutComponent {
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  private readonly _additionalClasses = signal<ClassValue>('');
  readonly hostClass = computed(() =>
    hlm(
      'group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full',
      this.userClass(),
      this._additionalClasses(),
    ),
  );
}
