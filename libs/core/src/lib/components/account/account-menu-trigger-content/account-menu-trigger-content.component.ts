import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { ClassValue } from 'clsx';

import { Profile } from '@rabbithole/declarations/backend';
import { HlmAvatarImports } from '@spartan-ng/helm/avatar';
import { hlm } from '@spartan-ng/helm/utils';

import { AvatarService } from '../../../services/avatar.service';

@Component({
  selector: 'core-account-menu-trigger-content',
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
  readonly #avatarService = inject(AvatarService);
  readonly profile = input.required<Profile>();
  readonly avatarSrc = computed(() =>
    this.#avatarService.avatarSrc(this.profile().avatarRef[0]),
  );

  readonly displayName = computed(() => this.profile().displayName[0] ?? null);

  readonly username = computed(() => this.profile().username);

  readonly title = computed(() => this.displayName() ?? this.username());
}
