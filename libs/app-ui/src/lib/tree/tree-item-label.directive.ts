import { computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/helm/utils';
import { ClassValue } from 'clsx';

@Directive({
  selector: '[rbthTreeItemLabel]',
  host: {
    '[class]': 'computedClass()',
    'data-slot': 'tree-item-label',
  },
})
export class RbthTreeLabelDirective {
  readonly userClass = input<ClassValue>('');
  protected readonly computedClass = computed(() =>
    hlm(
      'in-focus-visible:ring-ring/50 bg-background hover:bg-accent in-data-[selected=true]:bg-accent in-data-[selected=true]:text-accent-foreground in-data-[drag-target=true]:bg-accent flex items-center gap-1 rounded-sm px-2 py-1.5 text-sm transition-colors not-in-data-[folder=true]:ps-7 in-focus-visible:ring-[3px] in-data-[search-match=true]:bg-blue-400/20! [&_ng-icon]:pointer-events-none [&_ng-icon]:shrink-0 in-data-[selected=true]:font-bold',
      this.userClass(),
    ),
  );
}
