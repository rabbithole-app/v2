import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/helm/utils';
import { ClassValue } from 'clsx';

@Directive({
  selector: '[coreAccountMenuTriggerContentDescription]',
  standalone: true,
  host: {
    '[class]': '_computedClass()',
  },
})
export class AccountMenuTriggerContentDescriptionDirective {
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    hlm(
      'w-full truncate font-mono text-xs text-muted-foreground',
      this.userClass(),
    ),
  );
}
