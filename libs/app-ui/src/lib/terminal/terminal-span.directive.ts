import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/helm/utils';
import { ClassValue } from 'clsx';

@Directive({
  selector: 'span[rbthTerminalSpan]',
  host: {
    '[class]': '_computedClass()',
  },
})
export class TerminalSpanDirective {
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected _computedClass = computed(() =>
    hlm('grid text-sm font-normal tracking-tight', this.userClass()),
  );
}
