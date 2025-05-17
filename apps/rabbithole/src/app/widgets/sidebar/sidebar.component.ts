import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import { BrnSeparatorComponent } from '@spartan-ng/brain/separator';
import { HlmSeparatorDirective } from '@spartan-ng/ui-separator-helm';
import type { ClassValue } from 'clsx';

import { NavigationComponent } from '../navigation/navigation.component';
import { SidebarHeaderComponent } from '../sidebar-header/sidebar-header.component';
import { RbthSidebarLayoutModule, SidebarService } from '@rabbithole/ui';

@Component({
  selector: 'app-sidebar-layout',
  imports: [
    RbthSidebarLayoutModule,
    BrnSeparatorComponent,
    HlmSeparatorDirective,
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
  // eslint-disable-next-line @angular-eslint/no-input-rename
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  private readonly _additionalClasses = signal<ClassValue>('');
  readonly hostClass = computed(() =>
    hlm(
      'group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full',
      this.userClass(),
      this._additionalClasses()
    )
  );
}
