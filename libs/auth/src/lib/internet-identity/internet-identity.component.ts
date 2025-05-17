import { Component, Directive, inject } from '@angular/core';

import { AUTH_SERVICE } from '../tokens';

@Directive({
  selector: '[rbthInternetIdentityTrigger]',
  standalone: true,
  host: {
    '(click)': 'authService.signIn()',
  },
})
export class RbthInternetIdentityTriggerDirective {
  authService = inject(AUTH_SERVICE);
}

@Component({
  selector: 'rbth-internet-identity',
  template: `<ng-content />`,
})
export class RbthInternetIdentityComponent {}
