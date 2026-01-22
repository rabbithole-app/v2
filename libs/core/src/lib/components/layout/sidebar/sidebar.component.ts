import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import type { ClassValue } from 'clsx';

import { RbthSidebarLayoutModule, SidebarService } from '@rabbithole/ui';
import { HlmSeparator } from '@spartan-ng/helm/separator';
import { hlm } from '@spartan-ng/helm/utils';

import { AccountMenuComponent } from '../../account/account-menu/account-menu.component';
import { SidebarHeaderComponent } from '../sidebar-header/sidebar-header.component';

@Component({
  selector: 'core-sidebar-layout',
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
