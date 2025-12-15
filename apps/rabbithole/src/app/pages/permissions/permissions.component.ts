import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideLogOut } from '@ng-icons/lucide';
import { hlm } from '@spartan-ng/helm/utils';
import { ClassValue } from 'clsx';
import { match, P } from 'ts-pattern';

import { PermissionsTableComponent } from '@rabbithole/core';
import { PermissionsService } from './permissions.service';
import { AUTH_SERVICE } from '@rabbithole/auth';
import { type Entry } from '@rabbithole/encrypted-storage';
import { RbthTreeComponent, TreeNode } from '@rabbithole/ui';

@Component({
  selector: 'app-permissions',
  imports: [PermissionsTableComponent, RbthTreeComponent],
  providers: [provideIcons({ lucideLogOut })],
  templateUrl: './permissions.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'computedClass()',
  },
})
export class PermissionsComponent {
  authService = inject(AUTH_SERVICE);
  permissionsService = inject(PermissionsService);
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected readonly computedClass = computed(() =>
    hlm('grid grid-cols-[300px_1fr] gap-4', this.userClass()),
  );

  handleSelect(node: TreeNode | undefined) {
    const entry = match(node)
      .returnType<Entry | null>()
      .with({ children: P.array(), path: P.string.select() }, (path) => [
        'Directory',
        path,
      ])
      .with({ path: P.string.select() }, (path) => ['File', path])
      .otherwise(() => null);
    this.permissionsService.setEntry(entry);
  }
}
