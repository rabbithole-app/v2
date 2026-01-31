import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBinary,
  lucideCircleCheck,
  lucideCircleDashed,
  lucideCircleX,
  lucideFileArchive,
  lucideLoader2,
} from '@ng-icons/lucide';

import { formatBytes } from '@rabbithole/core';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import type { Asset } from '../../types';

@Component({
  selector: 'rbth-feat-releases-asset-item',
  imports: [NgIcon, HlmIcon, HlmBadge, ...HlmItemImports, HlmSpinner],
  providers: [
    provideIcons({
      lucideFileArchive,
      lucideBinary,
      lucideCircleCheck,
      lucideCircleDashed,
      lucideCircleX,
      lucideLoader2,
    }),
  ],
  host: {
    class: 'contents'
  },
  template: `
    <div hlmItem size="sm" variant="muted">
      <div hlmItemMedia variant="icon">
        @if (isArchive()) {
          <ng-icon hlmIcon name="lucideFileArchive" size="sm" />
        } @else {
          <ng-icon hlmIcon name="lucideBinary" size="sm" />
        }
      </div>
      <div hlmItemContent>
        <span hlmItemTitle>{{ asset().name }}</span>
        <p hlmItemDescription class="text-xs">{{ formattedSize() }}</p>
      </div>
      <div hlmItemActions>
        <!-- Download status badge -->
        @switch (asset().downloadStatus.type) {
          @case ('Completed') {
            <span hlmBadge variant="outline" class="text-xs">
              <ng-icon hlmIcon name="lucideCircleCheck" size="xs" />
              Downloaded
            </span>
          }
          @case ('Downloading') {
            <span hlmBadge variant="secondary" class="text-xs">
              <hlm-spinner icon="lucideLoader2" class="text-xs" />
              Downloading
              {{ downloadProgress() }}
            </span>
          }
          @case ('Error') {
            <span hlmBadge variant="destructive" class="text-xs">Error</span>
          }
          @case ('NotStarted') {
            <span hlmBadge variant="outline" class="text-xs">Pending</span>
          }
        }

        <!-- Extraction status badge (for archives) -->
        @if (asset().extractionStatus; as extraction) {
          @switch (extraction.type) {
            @case ('Complete') {
              <span hlmBadge variant="outline" class="text-xs">
                <ng-icon hlmIcon name="lucideCircleCheck" size="xs" />
                Extracted
              </span>
            }
            @case ('Decoding') {
              <span hlmBadge variant="secondary" class="text-xs">
                <hlm-spinner icon="lucideLoader2" class="text-xs" />
                Decoding
                {{ extractionProgress() }}
              </span>
            }
            @case ('Idle') {
              <span hlmBadge variant="outline" class="text-xs">Pending</span>
            }
          }
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseAssetItemComponent {
  readonly asset = input.required<Asset>();

  readonly downloadProgress = computed(() => {
    const status = this.asset().downloadStatus;
    if (status.type === 'Downloading') {
      const { chunksCompleted, chunksTotal } = status;
      if (chunksTotal > 0) {
        const percent = Math.round((chunksCompleted * 100) / chunksTotal);
        return `${percent}%`;
      }
    }
    return 'Downloading...';
  });

  readonly extractionProgress = computed(() => {
    const status = this.asset().extractionStatus;
    if (status?.type === 'Decoding') {
      const { processed, total } = status;
      if (total > 0) {
        const percent = Math.round((processed * 100) / total);
        return `${percent}%`;
      }
    }
    return 'Extracting...';
  });

  readonly formattedSize = computed(() => formatBytes(this.asset().size));

  readonly isArchive = computed(() => this.asset().name.endsWith('.tar.gz'));
}
