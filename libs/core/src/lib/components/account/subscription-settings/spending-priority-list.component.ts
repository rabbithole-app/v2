import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGripVertical } from '@ng-icons/lucide';

import type { TokenId } from '@rabbithole/declarations/backend';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmIcon } from '@spartan-ng/helm/icon';

import { SettingsService } from '../../../services/settings.service';

const TOKEN_META = {
  ckUSDC: { label: 'ckUSDC', network: 'Internet Computer' },
  ckUSDT: { label: 'ckUSDT', network: 'Internet Computer' },
  ckETH: { label: 'ckETH', network: 'Internet Computer' },
  ICP: { label: 'ICP', network: 'Internet Computer' },
  BaseUSDC: { label: 'USDC', network: 'Base' },
  BaseUSDT: { label: 'USDT', network: 'Base' },
  BaseETH: { label: 'ETH', network: 'Base' },
  SolUSDC: { label: 'USDC', network: 'Solana' },
  SolUSDT: { label: 'USDT', network: 'Solana' },
  SOL: { label: 'SOL', network: 'Solana' },
} as const;

interface PriorityToken {
  key: TokenKey;
  label: string;
  network: string;
  tokenId: TokenId;
}

type TokenKey = keyof typeof TOKEN_META;

@Component({
  selector: 'core-spending-priority-list',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    ...HlmFieldImports,
    HlmBadge,
    HlmButton,
    HlmIcon,
    NgIcon,
  ],
  providers: [provideIcons({ lucideGripVertical })],
  templateUrl: './spending-priority-list.component.html',
  styles: [
    `
      .cdk-drag-preview {
        border-radius: 0.5rem;
        box-shadow:
          0 10px 15px -3px rgb(0 0 0 / 0.1),
          0 4px 6px -4px rgb(0 0 0 / 0.1);
      }

      .cdk-drag-placeholder {
        opacity: 0.35;
      }

      .cdk-drag-animating,
      .cdk-drop-list-dragging .cdk-drag {
        transition: transform 160ms cubic-bezier(0, 0, 0.2, 1);
      }

      .priority-drop-zone.cdk-drop-list-dragging {
        border-color: color-mix(in oklch, var(--primary) 35%, transparent);
        background: color-mix(in oklch, var(--primary) 8%, transparent);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpendingPriorityListComponent {
  readonly draftPriority = signal<TokenId[]>([]);
  readonly isSaving = signal(false);
  readonly items = computed<PriorityToken[]>(() =>
    this.draftPriority().map((tokenId) => {
      const key = tokenKey(tokenId);
      return { key, tokenId, ...TOKEN_META[key] };
    }),
  );
  readonly #settingsService = inject(SettingsService);
  readonly settingsReady = computed(() => this.#settingsService.settings() !== null);

  constructor() {
    effect(() => {
      this.draftPriority.set([...this.#settingsService.spendingPriority()]);
    });
  }

  async drop(event: CdkDragDrop<PriorityToken[]>): Promise<void> {
    if (event.previousIndex === event.currentIndex || this.isSaving()) return;

    const settings = this.#settingsService.settings();
    if (!settings) return;

    const nextPriority = [...this.draftPriority()];
    moveItemInArray(nextPriority, event.previousIndex, event.currentIndex);
    this.draftPriority.set(nextPriority);
    this.isSaving.set(true);

    try {
      await this.#settingsService.updateSettings({
        ...settings,
        spendingPriority: nextPriority,
      });
    } catch {
      this.draftPriority.set([...this.#settingsService.spendingPriority()]);
    } finally {
      this.isSaving.set(false);
    }
  }
}

function tokenKey(tokenId: TokenId): TokenKey {
  return Object.keys(tokenId)[0] as TokenKey;
}
