import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { HlmAvatarImports } from '@spartan-ng/helm/avatar';

import { CopyToClipboardComponent } from '../copy-to-clipboard';

@Component({
  selector: 'rbth-user-identity',
  imports: [CopyToClipboardComponent, HlmAvatarImports],
  template: `
    <hlm-avatar class="size-9 shrink-0 border bg-muted text-xs">
      @if (avatarSrc(); as src) {
        <img hlmAvatarImage [src]="src" [alt]="title()" />
      }
      <img hlmAvatarFallback src="/avatar-placeholder.svg" [alt]="title()" />
    </hlm-avatar>

    <div class="min-w-0 flex-1">
      <div class="truncate font-medium">
        {{ title() }}
      </div>

      @if (username(); as value) {
        <div class="truncate text-xs text-muted-foreground">@{{ value }}</div>
      } @else if (email(); as value) {
        <div class="truncate text-xs text-muted-foreground">
          {{ value }}
        </div>
      }

      @if (principalId(); as value) {
        @if (copyPrincipal()) {
          <rbth-copy-to-clipboard [content]="value">
            {{ value }}
          </rbth-copy-to-clipboard>
        } @else {
          <div class="truncate font-mono text-xs text-muted-foreground">
            {{ value }}
          </div>
        }
      }
    </div>
  `,
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
