import { ChangeDetectionStrategy, Component } from '@angular/core';

import { RbthSafari } from '@rabbithole/ui';
import { HlmBadge } from '@spartan-ng/helm/badge';

@Component({
  selector: 'app-landing-preview',
  imports: [HlmBadge, RbthSafari],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block py-16 px-6',
  },
  template: `
    <div class="mx-auto w-full max-w-5xl">
      <div class="mb-12 text-center">
        <span hlmBadge variant="secondary" class="mb-4">See it in action</span>
        <h2 class="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Your files. Your interface.
        </h2>
        <p class="mx-auto mt-4 max-w-lg text-muted-foreground">
          A familiar file manager — but everything is encrypted
          and stored in your personal smart contract.
        </p>
      </div>

      <rbth-safari
        imageSrc="/screen.png"
        url="rabbithole.app"
      />
    </div>
  `,
})
export class PreviewSectionComponent {}
