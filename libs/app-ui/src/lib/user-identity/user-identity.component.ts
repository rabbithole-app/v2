import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { HlmAvatarImports } from '@spartan-ng/helm/avatar';

import { CopyToClipboardComponent } from '../copy-to-clipboard';

@Component({
  selector: 'rbth-user-identity',
  imports: [CopyToClipboardComponent, HlmAvatarImports],
  templateUrl: "./user-identity.component.html",
  host: {
    class: 'flex min-w-0 items-center gap-3',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserIdentityComponent {
  readonly avatarSrc = input<string | undefined>();
  readonly copyPrincipal = input(false);
  readonly email = input<string | undefined>();
  readonly principalId = input<string | undefined>();
  readonly title = input.required<string>();
  readonly username = input<string | undefined>();
}
