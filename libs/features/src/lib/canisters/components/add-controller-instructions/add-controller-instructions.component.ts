import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert } from '@ng-icons/lucide';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmIcon } from '@spartan-ng/helm/icon';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { ENCRYPTED_STORAGE_CANISTER_ID } from '@rabbithole/core';
import { TerminalComponent, TerminalSpanDirective } from '@rabbithole/ui';

@Component({
  selector: 'feature-add-controller-instructions',
  imports: [
    ...HlmAlertImports,
    NgIcon,
    HlmIcon,
    TerminalComponent,
    TerminalSpanDirective,
  ],
  providers: [provideIcons({ lucideCircleAlert })],
  template: `
    <div hlmAlert variant="destructive">
      <ng-icon hlm hlmAlertIcon name="lucideCircleAlert" />
      <h4 hlmAlertTitle>You are not a controller of this canister</h4>
      <div hlmAlertDescription>
        To upload frontend assets, you need to be a controller of this canister.
        Ask another controller to add you as a controller using the command
        below.
      </div>
    </div>
    <rbth-terminal>
      <span rbthTerminalSpan>&gt; {{ commandToAddController() }}</span>
    </rbth-terminal>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddControllerInstructionsComponent {
  readonly isProduction = input<boolean>(false);

  #authService = inject(AUTH_SERVICE);
  #canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);

  readonly commandToAddController = computed(() => {
    const network = this.isProduction() ? ' --ic' : '';
    return `dfx canister update-settings --add-controller ${this.#authService.principalId()}${network} ${this.#canisterId}`;
  });
}
