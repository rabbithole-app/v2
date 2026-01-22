import { Clipboard, ClipboardModule } from '@angular/cdk/clipboard';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  Signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { IconName, NgIcon, provideIcons } from '@ng-icons/core';
import { lucideClipboard, lucideClipboardCheck } from '@ng-icons/lucide';
import { ClassValue } from 'clsx';
import { of, Subject, timer } from 'rxjs';
import { map, mergeWith, switchMap } from 'rxjs/operators';

import { RbthTooltipTriggerDirective } from '@rabbithole/ui';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { hlm } from '@spartan-ng/helm/utils';

@Component({
  selector: 'core-copy-to-clipboard',
  template: `<span class="min-w-0 flex-1 font-mono text-xs truncate">
      <ng-content />
    </span>
    <button
      hlmBtn
      variant="ghost"
      size="icon"
      class="shrink-0 size-6"
      [rbthTooltipTrigger]="'Copy to clipboard'"
      (click)="handleCopy($event)"
    >
      <ng-icon hlm [name]="iconName()" size="sm" />
      <span class="sr-only">Copy to clipboard</span>
    </button>`,
  imports: [
    NgIcon,
    HlmButton,
    HlmIcon,
    RbthTooltipTriggerDirective,
    ClipboardModule,
  ],
  providers: [
    provideIcons({
      lucideClipboard,
      lucideClipboardCheck,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '_computedClass()',
  },
})
export class CopyToClipboardComponent {
  content = input.required<string>();
  #copied = new Subject<void>();

  iconName: Signal<IconName> = toSignal(
    this.#copied
      .asObservable()
      .pipe(
        switchMap(() =>
          of('lucideClipboardCheck' as const).pipe(
            mergeWith(timer(1500).pipe(map(() => 'lucideClipboard' as const))),
          ),
        ),
      ),
    { initialValue: 'lucideClipboard' },
  );

  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected _computedClass = computed(() =>
    hlm('flex min-w-0 items-center gap-1', this.userClass()),
  );
  #clipboard = inject(Clipboard);

  handleCopy(event: MouseEvent) {
    event.stopPropagation();
    this.#clipboard.copy(this.content());
    this.#copied.next();
  }
}
