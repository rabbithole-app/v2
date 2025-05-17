import { NgModule } from '@angular/core';

import {
  RbthDelegationInternetIdentityComponent,
  RbthDelegationInternetIdentityTriggerDirective,
} from './lib/delegation-internet-identity/delegation-internet-identity';
import {
  RbthInternetIdentityComponent,
  RbthInternetIdentityTriggerDirective,
} from './lib/internet-identity/internet-identity.component';

export * from './lib/asserts';
export * from './lib/auth.service';
export * from './lib/internet-identity/internet-identity.component';
export * from './lib/tokens';

export const RbthInternetIdentityImports = [
  RbthInternetIdentityTriggerDirective,
  RbthInternetIdentityComponent,
  RbthDelegationInternetIdentityComponent,
  RbthDelegationInternetIdentityTriggerDirective,
] as const;

@NgModule({
  imports: [...RbthInternetIdentityImports],
  exports: [...RbthInternetIdentityImports],
})
export class RbthInternetIdentityModule {}
