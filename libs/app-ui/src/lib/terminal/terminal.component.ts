import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { hlm } from '@spartan-ng/helm/utils';
import { ClassValue } from 'clsx';

@Component({
  selector: 'rbth-terminal',
  template: `
    <div class="border-border flex flex-col gap-y-2 border-b p-4">
      <div class="flex flex-row gap-x-2">
        <div class="h-2 w-2 rounded-full bg-red-500"></div>
        <div class="h-2 w-2 rounded-full bg-yellow-500"></div>
        <div class="h-2 w-2 rounded-full bg-green-500"></div>
      </div>
    </div>
    <pre class="p-4">
      <code class="grid gap-y-1 overflow-auto"><ng-content /></code>
    </pre>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '_computedClass()',
  },
})
export class TerminalComponent {
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected _computedClass = computed(() =>
    hlm(
      'border-border bg-background z-0 h-full max-h-[400px] w-full max-w-lg rounded-xl border',
      this.userClass(),
    ),
  );
}
