import type { BooleanInput } from '@angular/cdk/coercion';
import { booleanAttribute, Directive, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { buttonVariants, type ButtonVariants } from '@spartan-ng/helm/button';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[hlmPaginationLink]',
  hostDirectives: [
    {
      directive: RouterLink,
      inputs: [
        'target',
        'queryParams',
        'fragment',
        'queryParamsHandling',
        'state',
        'info',
        'relativeTo',
        'preserveFragment',
        'skipLocationChange',
        'replaceUrl',
        'routerLink: link',
      ],
    },
  ],
  host: {
    'data-slot': 'pagination-link',
    '[attr.data-active]': 'isActive() ? "true" : null',
    '[attr.aria-current]': 'isActive() ? "page" : null',
  },
})
export class HlmPaginationLink {
  /** Whether the link is active (i.e., the current page). */
  public readonly isActive = input<boolean, BooleanInput>(false, {
    transform: booleanAttribute,
  });
  /** The link to navigate to the page. */
  public readonly link = input<RouterLink['routerLink']>();
  /** The size of the button. */
  public readonly size = input<ButtonVariants['size']>('icon');

  constructor() {
    classes(() => [
      this.link() === undefined ? 'cursor-pointer' : '',
      buttonVariants({
        variant: this.isActive() ? 'outline' : 'ghost',
        size: this.size(),
      }),
    ]);
  }
}
