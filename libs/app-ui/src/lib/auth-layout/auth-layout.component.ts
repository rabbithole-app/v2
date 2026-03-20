import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'rbth-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block relative min-h-dvh text-foreground bg-muted/40',
  },
  template: `
    <ng-content select="[navbar]" />
    <ng-content />
  `,
})
export class RbthAuthLayout {}
