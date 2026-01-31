import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCalendar,
  lucideLoader2,
  lucideTag,
} from '@ng-icons/lucide';

import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import type { Release } from '../../types';
import { ReleaseAssetItemComponent } from '../release-asset-item/release-asset-item.component';

@Component({
  selector: 'rbth-feat-releases-release-card',
  imports: [
    DatePipe,
    NgIcon,
    HlmIcon,
    HlmBadge,
    ...HlmCardImports,
    HlmSpinner,
    ReleaseAssetItemComponent,
  ],
  providers: [
    provideIcons({
      lucideCalendar,
      lucideLoader2,
      lucideTag,
    }),
  ],
  template: `
    <section hlmCard>
      <div hlmCardHeader>
        <div class="flex items-center justify-between">
          <h3 hlmCardTitle class="flex items-center gap-2">
            <ng-icon hlmIcon name="lucideTag" size="sm" class="text-muted-foreground" />
            <span class="font-mono">{{ release().tagName }}</span>
          </h3>
        </div>
        <p hlmCardDescription class="flex items-center gap-4">
          <span>{{ release().name }}</span>
          <span class="flex items-center gap-1">
            <ng-icon hlmIcon name="lucideCalendar" size="xs" />
            {{ displayDate() | date: 'mediumDate' }}
          </span>
          @switch (release().type) {
            @case ('draft') {
              <span hlmBadge variant="outline" class="text-xs">Draft</span>
            }
            @case ('prerelease') {
              <span hlmBadge variant="secondary" class="text-xs">Pre-release</span>
            }
            @case ('stable') {
              <span hlmBadge variant="default" class="text-xs">Stable</span>
            }
          }
        </p>
      </div>

      <div hlmCardContent class="flex flex-col gap-2">
        @for (asset of release().assets; track asset.name) {
          <rbth-feat-releases-asset-item [asset]="asset" />
        } @empty {
          <p class="text-muted-foreground text-sm">No assets</p>
        }
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseCardComponent {
  readonly release = input.required<Release>();

  readonly displayDate = computed(() => {
    const release = this.release();
    return release.publishedAt ?? release.createdAt;
  });
}
