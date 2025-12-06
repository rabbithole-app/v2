import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { Principal } from '@dfinity/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideKey, lucideUser, lucideX } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmButtonGroupImports } from '@spartan-ng/helm/button-group';

@Component({
  selector: 'core-controller-item',
  imports: [HlmButtonGroupImports, HlmButton, NgIcon],
  providers: [
    provideIcons({
      lucideUser,
      lucideKey,
      lucideX,
    }),
  ],
  template: `
    <div hlmButtonGroup class="w-full">
      <button hlmBtn variant="secondary" size="icon">
        <ng-icon
          hlm
          [name]="isCurrentUser() ? 'lucideUser' : 'lucideKey'"
          class="size-4"
        />
      </button>
      <span hlmButtonGroupText class="truncate flex-1 min-w-0">{{
        principalText()
      }}</span>
      <hlm-button-group-separator />
      <button
        hlmBtn
        variant="secondary"
        size="icon"
        [disabled]="isCurrentUser() || disabled()"
        (click)="_onRemove()"
      >
        <ng-icon hlm name="lucideX" class="size-4" />
      </button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControllerItemComponent {
  readonly controller = input.required<Principal>();
  readonly disabled = input(false);
  readonly isCurrentUser = input.required<boolean>();
  readonly principalText = input.required<string>();

  readonly remove = output<Principal>();

  protected _onRemove() {
    if (!this.isCurrentUser() && !this.disabled()) {
      this.remove.emit(this.controller());
    }
  }
}
