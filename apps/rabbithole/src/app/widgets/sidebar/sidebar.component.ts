import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { hlm } from '@spartan-ng/helm/utils';
import { BrnSeparator } from '@spartan-ng/brain/separator';
import type { ClassValue } from 'clsx';

import { NavigationComponent } from '../navigation/navigation.component';
import { SidebarHeaderComponent } from '../sidebar-header/sidebar-header.component';
import { RbthSidebarLayoutModule, SidebarService } from '@rabbithole/ui';

@Component({
  selector: 'app-sidebar-layout',
  imports: [
    RbthSidebarLayoutModule,
    BrnSeparator,
    SidebarHeaderComponent,
    NavigationComponent,
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
