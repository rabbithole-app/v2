import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { HlmAvatarImports } from '@spartan-ng/helm/avatar';
import { hlm } from '@spartan-ng/helm/utils';
import { ClassValue } from 'clsx';

import { Profile } from '@rabbithole/declarations';

@Component({
  selector: 'shared-account-menu-trigger-content',
  imports: [HlmAvatarImports],
  host: {
    '[class]': '_computedClass()',
  },
  templateUrl: './account-menu-trigger-content.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountMenuTriggerContentComponent {
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  readonly _computedClass = computed(() =>
    hlm('w-full max-w-[200px] flex items-center gap-2', this.userClass()),
  );
  readonly profile = input.required<Profile>();
  readonly avatarSrc = computed(() => this.profile().avatarUrl[0] ?? null);

  readonly displayName = computed(() => this.profile().displayName[0] ?? null);

  readonly username = computed(() => this.profile().username);

  readonly title = computed(() => this.displayName() ?? this.username());
}
