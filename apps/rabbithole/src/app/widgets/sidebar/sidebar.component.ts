import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import { hlm } from '@spartan-ng/helm/utils';
import type { ClassValue } from 'clsx';

import { SidebarHeaderComponent } from '../sidebar-header/sidebar-header.component';
import { AccountMenuComponent } from '@rabbithole/core';
import { RbthSidebarLayoutModule, SidebarService } from '@rabbithole/ui';

@Component({
  selector: 'app-sidebar-layout',
  imports: [
    RbthSidebarLayoutModule,
    SidebarHeaderComponent,
    RouterOutlet,
    HlmSeparator,
    AccountMenuComponent,
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
