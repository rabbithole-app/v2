import { FocusableOption, Highlightable } from '@angular/cdk/a11y';
import { booleanAttribute, ElementRef, signal } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideEye, lucideLock, lucideUsers } from '@ng-icons/lucide';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ClassValue } from 'clsx';

import { DownloadService, ENCRYPTED_STORAGE_CANISTER_ID, IS_PRODUCTION_TOKEN } from '@rabbithole/core';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmProgressImports } from '@spartan-ng/helm/progress';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { hlm } from '@spartan-ng/helm/utils';

import { isDirectory, isFile, NodeItem } from '../../types';
import { AnimatedFolderComponent } from '../animated-folder/animated-folder.component';
import { FileIconComponent } from '../file-icon/file-icon.component';

export const gridItemVariants = cva(
  'grid gap-y-2 grid-rows-[1fr_36px] items-start p-3 select-none transition-colors duration-200 ease-in-out rounded-lg cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
  {
    variants: {
      selected: {
        true: 'ring-2 ring-primary bg-muted',
        false: '',
      },
      highlighted: {
        true: 'ring-2 ring-primary ring-offset-2',
        false: '',
      },
      active: {
        true: 'border-2 border-dashed border-sky-500 bg-sky-50/50 dark:bg-sky-950/20',
        false: '',
      },
      downloading: {
        true: 'pointer-events-none',
        false: '',
      },
    },
    defaultVariants: {
      selected: false,
      highlighted: false,
      active: false,
      downloading: false,
    },
  },
);

export type DownloadProgressState = {
  errorMessage?: string;
  percent: number | null;
  status: 'downloading' | 'failed' | 'queued';
};

export type GridItemVariants = VariantProps<typeof gridItemVariants>;

@Component({
  selector: 'rbth-feat-file-list-grid-item',
  templateUrl: './grid-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AnimatedFolderComponent, FileIconComponent, NgIcon, HlmBadgeImports, HlmProgressImports, HlmTooltipImports],
  providers: [provideIcons({ lucideEye, lucideLock, lucideUsers })],
  host: {
    '[class]': '_computedClass()',
    '[tabindex]': '_isDownloading() ? -1 : (data().disabled ? -1 : 0)',
    '[attr.role]': '"gridcell"',
    '[attr.aria-selected]': 'selected()',
    '[attr.aria-label]': 'itemName()',
    '[attr.id]': '_itemId()',
    '[attr.aria-disabled]': '_disabled() || _isDownloading()',
  },
  styles: [
    `
      :host.cdk-drop-list-dragging {
        border-width: 2px;
        border-style: dashed;
        border-color: rgb(14 165 233);
        background-color: rgb(14 165 233 / 0.08);
      }
      :host-context(.dark).cdk-drop-list-dragging {
        background-color: rgb(8 47 73 / 0.2);
      }
      :host.cdk-drag-preview {
        box-sizing: border-box;
        border-radius: 0.25rem;
        box-shadow:
          0 5px 5px -3px rgba(0, 0, 0, 0.2),
          0 8px 10px 1px rgba(0, 0, 0, 0.14),
          0 3px 14px 2px rgba(0, 0, 0, 0.12);
      }
      :host.cdk-drag-animating {
        transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
      }
      :host.cdk-drag-placeholder {
        opacity: 0;
      }
      :host.cdk-drag-dragging {
        z-index: 1;
      }
    `,
  ],
})
export class GridItemComponent implements FocusableOption, Highlightable {
  _disabled = input(false, { transform: booleanAttribute, alias: 'disabled' });
  active = input(false, { transform: booleanAttribute });
  data = input.required<NodeItem>();
  element = inject(ElementRef);
  loading = input(false, { transform: booleanAttribute });
  selected = input(false, { transform: booleanAttribute });
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  #downloadService = inject(DownloadService);

  protected readonly downloadProgress = computed<DownloadProgressState | null>(() => {
    const item = this.data();
    if (item.type !== 'file') return null;
    const path = item.parentPath
      ? `${item.parentPath}/${item.name}`
      : item.name;
    const state = this.#downloadService.getDownloadByEntryPath(path);
    if (!state) return null;
    const { status } = state.progress;
    if (status === 'canceled' || status === 'completed') return null;
    if (status === 'failed') {
      const errorMessage = 'errorMessage' in state.progress ? state.progress.errorMessage : 'Download failed';
      return { status: 'failed', percent: 0, errorMessage };
    }
    if (status === 'queued') {
      return { status: 'queued', percent: null };
    }
    if (status === 'downloading' && 'chunkIndex' in state.progress && 'totalChunks' in state.progress) {
      const total = state.progress.totalChunks || 1;
      const percent = Math.round((state.progress.chunkIndex / total) * 100);
      return { status: 'downloading', percent };
    }
    return { status: 'downloading', percent: 0 };
  });

  protected readonly _isDownloading = computed(() => {
    const dl = this.downloadProgress();
    return dl !== null && dl.status !== 'failed';
  });

  protected readonly highlighted = signal(false);

  protected readonly _computedClass = computed(() =>
    hlm(
      gridItemVariants({
        selected: this.selected(),
        highlighted: this.highlighted(),
        active: this.active(),
        downloading: this._isDownloading(),
      }),
      this.userClass(),
    ),
  );

  protected readonly _itemId = computed(() => {
    const item = this.data();
    return `grid-item-${item.id.toString()}`;
  });

  protected readonly isEncrypted = computed(() => {
    const item = this.data();
    if (isFile(item)) return item.encryptionMode === 'encrypted';
    if (isDirectory(item)) return item.defaultEncryptionMode === 'encrypted';
    return false;
  });
  protected readonly isFileNode = computed(() => isFile(this.data()));
  protected readonly isReadOnly = computed(() =>
    this.data().callerPermission === 'Read',
  );

  protected readonly isShared = computed(() => {
    const count = this.data().sharedWith;
    return count !== undefined && count > 0;
  });

  protected readonly badges = computed(() => {
    const items: { icon: string; title: string }[] = [];
    if (this.isShared()) {
      const count = this.data().sharedWith!;
      items.push({ icon: 'lucideUsers', title: `Shared with ${count} user(s)` });
    }
    if (this.isReadOnly()) {
      items.push({ icon: 'lucideEye', title: 'Read only' });
    }
    if (this.isEncrypted() && this.isFileNode()) {
      items.push({ icon: 'lucideLock', title: 'Encrypted' });
    }
    return items;
  });

  protected readonly badgeTooltip = computed(() =>
    this.badges().map((b) => b.title).join(', '),
  );

  protected readonly directoryColor = computed(() => {
    const item = this.data();
    return isDirectory(item) ? (item.color ?? 'blue') : 'blue';
  });

  protected readonly fileExtension = computed(() => {
    const item = this.data();
    if (isFile(item)) {
      const parts = item.name.split('.');
      return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
    }
    return '';
  });

  protected readonly hasThumbnail = computed(() => {
    const item = this.data();
    return isFile(item) && !!item.thumbnailKey;
  });

  protected readonly isDirectoryNode = computed(() => isDirectory(this.data()));
  protected readonly itemName = computed(() => this.data().name);

  #canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);

  readonly #isProduction = inject(IS_PRODUCTION_TOKEN);

  protected readonly thumbnailUrl = computed(() => {
    const item = this.data();
    if (isFile(item) && item.thumbnailKey) {
      const storageUrl = this.#isProduction
        ? `https://${this.#canisterId.toText()}.icp0.io`
        : `https://${this.#canisterId.toText()}.localhost`;
      return `${storageUrl}${item.thumbnailKey}`;
    }
    return null;
  });

  #elementRef = inject(ElementRef<HTMLElement>);

  focus(): void {
    this.#elementRef.nativeElement.focus();
  }

  getLabel(): string {
    return this.itemName();
  }

  setActiveStyles(): void {
    this.highlighted.set(true);
  }

  setInactiveStyles(): void {
    this.highlighted.set(false);
  }
}
