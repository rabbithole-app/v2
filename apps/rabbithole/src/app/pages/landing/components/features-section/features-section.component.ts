import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideCode,
  lucideFileKey,
  lucideFingerprint,
  lucideKeyRound,
  lucideMonitor,
  lucideShield,
} from '@ng-icons/lucide';

import { RbthBentoGridImports } from '@rabbithole/ui/bento-grid';
import { RbthMagicCard } from '@rabbithole/ui/magic-card';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';

@Component({
  selector: 'app-landing-features',
  imports: [NgIcon, HlmBadge, ...HlmButtonImports, ...RbthBentoGridImports, RbthMagicCard],
  providers: [
    provideIcons({
      lucideKeyRound,
      lucideShield,
      lucideFingerprint,
      lucideMonitor,
      lucideFileKey,
      lucideCode,
      lucideArrowRight,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block py-16 px-6',
  },
  template: `
    <div class="mx-auto max-w-6xl">
      <div class="mb-8 text-center">
        <span hlmBadge variant="secondary" class="mb-4">Why Rabbithole</span>
        <h2 class="mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Math-based security, not promises
        </h2>
        <p class="mx-auto mt-4 max-w-2xl text-balance text-muted-foreground">
          Traditional cloud storage asks you to trust a company.
          Rabbithole replaces that trust with cryptography.
        </p>
      </div>

      <div class="pointer-events-auto grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        @for (f of features; track f.title) {
          <rbth-magic-card
            [class]="f.colSpan + ' group'"
            [gradientFrom]="f.gradientFrom"
            [gradientTo]="f.gradientTo"
          >
            <div class="flex items-start gap-4 p-5">
              <!-- Text -->
              <div class="flex-1">
                <h3 class="text-lg font-semibold">{{ f.title }}</h3>
                <p class="mt-1 text-sm text-balance text-muted-foreground">{{ f.description }}</p>
                <a
                  hlmBtn
                  variant="link"
                  size="sm"
                  class="pointer-events-auto mt-2 p-0 lg:opacity-0 lg:transition-opacity lg:duration-300 lg:group-hover:opacity-100"
                  [href]="f.href"
                  target="_blank"
                  rel="noopener"
                >
                  Learn more <ng-icon name="lucideArrowRight" size="14" class="ms-1" />
                </a>
              </div>

              <!-- Icon -->
              <ng-icon
                [name]="f.icon"
                size="64"
                [class]="'shrink-0 opacity-[0.08] transition-opacity duration-300 lg:group-hover:opacity-[0.15] ' + f.iconColor"
              />
            </div>
          </rbth-magic-card>
        }
      </div>
    </div>
  `,
})
export class FeaturesSectionComponent {
  readonly features = [
    {
      icon: 'lucideKeyRound',
      title: 'Keys that vanish',
      description:
        'Your encryption key is derived through IC threshold cryptography. No single node sees the full key, and the key only exists in your browser briefly.',
      href: 'https://docs.rabbithole.app/en/how-it-works/encryption',
      colSpan: '',
      gradientFrom: '#9E7AFF',
      gradientTo: '#FE8BBB',
      iconColor: 'text-violet-500',
    },
    {
      icon: 'lucideShield',
      title: 'You are the sole controller',
      description:
        'Each user gets a personal smart contract. After handoff, Rabbithole removes itself and you become the only controller.',
      href: 'https://docs.rabbithole.app/en/how-it-works/sovereignty',
      colSpan: '',
      gradientFrom: '#3B82F6',
      gradientTo: '#06B6D4',
      iconColor: 'text-blue-500',
    },
    {
      icon: 'lucideFingerprint',
      title: 'No passwords ever',
      description:
        'Sign in with passkeys, biometrics, or social login. No email, no passwords, no credential databases.',
      href: 'https://docs.rabbithole.app/en/how-it-works/authentication',
      colSpan: '',
      gradientFrom: '#F59E0B',
      gradientTo: '#EF4444',
      iconColor: 'text-amber-500',
    },
    {
      icon: 'lucideMonitor',
      title: 'Always accessible',
      description:
        'Your storage has its own web address. If Rabbithole disappears — you still access your files directly.',
      href: 'https://docs.rabbithole.app/en/how-it-works/sovereignty',
      colSpan: '',
      gradientFrom: '#10B981',
      gradientTo: '#3B82F6',
      iconColor: 'text-emerald-500',
    },
    {
      icon: 'lucideFileKey',
      title: 'Per-file encryption',
      description:
        'Every file gets a unique key. Compromising one doesn\'t affect others. Sharing doesn\'t require re-encryption.',
      href: 'https://docs.rabbithole.app/en/how-it-works/encryption',
      colSpan: '',
      gradientFrom: '#EC4899',
      gradientTo: '#8B5CF6',
      iconColor: 'text-pink-500',
    },
    {
      icon: 'lucideCode',
      title: 'Open source',
      description:
        'Every line of code is public on GitHub. Verify the encryption, the key derivation, and the deployed WASM via SHA-256.',
      href: 'https://github.com/rabbithole-app/v2',
      colSpan: '',
      gradientFrom: '#6366F1',
      gradientTo: '#A855F7',
      iconColor: 'text-indigo-500',
    },
  ];
}
