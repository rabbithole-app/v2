import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

import { HlmBadge } from '@spartan-ng/helm/badge';

interface HowItWorksStep {
  readonly alt: string;
  readonly description: string;
  readonly image: string;
  readonly title: string;
}

@Component({
  selector: 'app-landing-how-it-works',
  imports: [HlmBadge, NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block px-6 py-16',
  },
  template: `
    <section aria-labelledby="how-it-works-title" class="mx-auto max-w-6xl">
      <div class="mx-auto max-w-2xl text-center">
        <span hlmBadge variant="secondary">How it works</span>
        <h2
          id="how-it-works-title"
          class="mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl"
        >
          Your private vault, step by step
        </h2>
        <p class="mt-4 text-balance text-muted-foreground">
          Rabbithole keeps the setup understandable: sign in, create a vault,
          upload files, then decide who can access each item.
        </p>
      </div>

      <ol
        class="mt-12 overflow-hidden rounded-3xl border bg-background/90 shadow-sm lg:grid lg:grid-cols-2"
      >
        @for (step of steps; track step.title; let index = $index) {
          <li
            class="border-b p-4 last:border-b-0 sm:p-5 lg:border-b-0 lg:p-6"
          >
            <div>
              <div class="flex items-start gap-4">
                <span
                  class="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background text-sm font-semibold"
                  aria-hidden="true"
                >
                  {{ index + 1 }}
                </span>
                <div class="min-w-0">
                  <h3 class="text-lg font-semibold leading-snug">
                    {{ step.title }}
                  </h3>
                  <p class="mt-2 text-sm leading-6 text-balance text-muted-foreground">
                    {{ step.description }}
                  </p>
                </div>
              </div>
            </div>

            <div class="mt-6 rounded-2xl bg-background p-3 sm:p-4">
              <img
                [ngSrc]="step.image"
                [alt]="step.alt"
                width="1448"
                height="1086"
                decoding="async"
                sizes="(max-width: 1023px) 90vw, 45vw"
                class="aspect-[4/3] w-full rounded-xl object-contain"
              />
            </div>
          </li>
        }
      </ol>
    </section>
  `,
  styles: `
    @media (min-width: 1024px) {
      li:nth-child(odd) {
        border-right-width: 1px;
      }

      li:nth-child(-n + 2) {
        border-bottom-width: 1px;
      }
    }
  `,
})
export class HowItWorksSectionComponent {
  readonly steps: HowItWorksStep[] = [
    {
      title: 'Sign in without passwords',
      description:
        'Use passkeys, biometrics, or social login. Rabbithole never asks you to manage a master password.',
      image: '/how-it-works/1.png',
      alt: 'Passwordless sign-in options: biometric, social login, and passkey.',
    },
    {
      title: 'Create a vault you own',
      description:
        'Rabbithole creates your vault, installs storage, and hands ownership back to you after setup.',
      image: '/how-it-works/2.png',
      alt: 'Vault setup flow showing Create Vault, storage installation, and ownership handoff to your vault.',
    },
    {
      title: 'Upload files',
      description:
        'Files are encrypted in your browser before upload, so your vault stores encrypted chunks.',
      image: '/how-it-works/3.png',
      alt: 'Upload flow showing files encrypted in the browser before encrypted chunks enter your vault.',
    },
    {
      title: 'Share or keep private',
      description:
        'Keep files private by default, invite specific people, and choose Viewer, Editor, or Manager permissions.',
      image: '/how-it-works/4.png',
      alt: 'Manage access panel showing private access, invited people, and permission levels.',
    },
  ];
}
