import { NgModule } from '@angular/core';

import {
  RbthInternetIdentityComponent,
  RbthInternetIdentityTriggerDirective,
} from './lib/internet-identity/internet-identity.component';

export * from './lib/asserts';
export * from './lib/auth.service';
export * from './lib/broker-auth.service';
export { DelegationAuthService } from './lib/delegation-auth.service';
export * from './lib/internet-identity/internet-identity.component';
export * from './lib/operators';
export * from './lib/tokens';

export const RbthInternetIdentityImports = [
  RbthInternetIdentityTriggerDirective,
  RbthInternetIdentityComponent,
] as const;

@NgModule({
  imports: [...RbthInternetIdentityImports],
  exports: [...RbthInternetIdentityImports],
})
export class RbthInternetIdentityModule {}
