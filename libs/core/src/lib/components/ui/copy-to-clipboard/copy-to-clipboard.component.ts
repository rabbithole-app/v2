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

import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { hlm } from '@spartan-ng/helm/utils';

type CopyToClipboardSize = 'sm' | 'xs';

@Component({
  selector: 'core-copy-to-clipboard',
  template: `<span data-slot="copy-content">
      <ng-content />
    </span>
    <button
      hlmBtn
      variant="ghost"
      size="icon"
      [class]="_buttonClass()"
      [hlmTooltip]="'Copy to clipboard'"
      (click)="handleCopy($event)"
    >
      <ng-icon hlm [name]="iconName()" [size]="_iconSize()" />
      <span class="sr-only">Copy to clipboard</span>
    </button>`,
  imports: [
    NgIcon,
    HlmButton,
    HlmIcon,
    ClipboardModule,
    ...HlmTooltipImports,
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
  readonly size = input<CopyToClipboardSize>('sm');

  protected _buttonClass = computed(() =>
    hlm('shrink-0', this.size() === 'xs' ? 'size-5' : 'size-6'),
  );

  protected _computedClass = computed(() =>
    hlm(
      'inline-flex max-w-full min-w-0 items-center align-middle',
      this.size() === 'xs' ? 'gap-0.5' : 'gap-1',
      '[&>[data-slot=copy-content]]:min-w-0',
      '[&>[data-slot=copy-content]]:flex-1',
      '[&>[data-slot=copy-content]]:truncate',
      '[&>[data-slot=copy-content]]:font-mono',
      this.size() === 'xs'
        ? '[&>[data-slot=copy-content]]:text-[11px]'
        : '[&>[data-slot=copy-content]]:text-xs',
      this.userClass(),
    ),
  );

  protected _iconSize = computed(() => (this.size() === 'xs' ? 'xs' : 'sm'));

  #clipboard = inject(Clipboard);

  handleCopy(event: MouseEvent) {
    event.stopPropagation();
    this.#clipboard.copy(this.content());
    this.#copied.next();
  }
}
