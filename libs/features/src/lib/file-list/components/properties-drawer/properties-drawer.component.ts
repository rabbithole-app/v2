import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { BrnSelectImports } from '@spartan-ng/brain/select';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';
import { toast } from '@spartan-ng/brain/sonner';

import { CoreTransparentSelectBackdropDirective } from '@rabbithole/core/ui';
import {
  RbthDrawerComponent,
  RbthDrawerContentComponent,
  RbthDrawerHeaderComponent,
  RbthDrawerTitleDirective,
} from '@rabbithole/ui/drawer';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmSelectImports } from '@spartan-ng/helm/select';

import { FileListService } from '../../services';
import {
  isDirectory,
  isFile,
  NodeItem,
  ThumbnailStoragePolicy,
} from '../../types';

type DirectoryPolicyDraft = {
  thumbnailStoragePolicy: ThumbnailStoragePolicy;
};

const defaultPolicyDraft: DirectoryPolicyDraft = {
  thumbnailStoragePolicy: 'inherit',
};

@Component({
  selector: 'rbth-feat-properties-drawer',
  templateUrl: "./properties-drawer.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    BrnSheetContent,
    RbthDrawerComponent,
    RbthDrawerContentComponent,
    RbthDrawerHeaderComponent,
    RbthDrawerTitleDirective,
    HlmButton,
    HlmFieldImports,
    CoreTransparentSelectBackdropDirective,
    BrnSelectImports,
    HlmSelectImports,
  ],
})
export class PropertiesDrawerComponent {
  readonly directoryPolicyDraft =
    signal<DirectoryPolicyDraft>(defaultPolicyDraft);

  readonly directoryPolicySaving = signal(false);

  isDirectoryItem = isDirectory;

  isFileItem = isFile;

  items = input.required<NodeItem[]>();
  singleItem = computed(() =>
    this.items().length === 1 ? this.items()[0] : null,
  );

  readonly #fileListService = inject(FileListService);

  readonly thumbnailStoragePolicyOptions = computed(() => {
    const options = [
      { value: 'inherit', label: 'Inherit', description: 'Inherit from parent folder' },
      {
        value: 'onChain',
        label: 'On-chain',
        description: 'Store thumbnails in canister memory',
      },
      {
        value: 'blobStorage',
        label: 'Blob Storage',
        description: 'Store thumbnails with blob objects',
      },
    ] as const;
    return this.#fileListService.storageBackendType.value() === 'BlobStorage'
      ? options.filter((option) => option.value !== 'onChain')
      : options;
  });

  totalSize = computed(() =>
    this.items().reduce(
      (sum, item) => sum + (isFile(item) ? item.size : 0n),
      0n,
    ),
  );

  typesSummary = computed(() => {
    const files = this.items().filter(isFile).length;
    const dirs = this.items().filter(isDirectory).length;
    const parts: string[] = [];
    if (files) parts.push(`${files} file(s)`);
    if (dirs) parts.push(`${dirs} folder(s)`);
    return parts.join(', ');
  });

  private readonly drawer = viewChild(RbthDrawerComponent);

  constructor() {
    effect(() => {
      const item = this.singleItem();
      if (!item || !isDirectory(item)) {
        this.directoryPolicyDraft.set(defaultPolicyDraft);
        return;
      }

      this.directoryPolicyDraft.set({
        thumbnailStoragePolicy: item.thumbnailStoragePolicy,
      });
    });
  }

  canEditDirectoryPolicy(item: NodeItem) {
    return isDirectory(item) && item.callerPermission === 'ReadWriteManage';
  }

  directoryPolicyDirty(item: NodeItem) {
    if (!isDirectory(item)) return false;
    const draft = this.directoryPolicyDraft();
    return draft.thumbnailStoragePolicy !== item.thumbnailStoragePolicy;
  }

  formatSize(bytes: bigint | number) {
    const n = Number(bytes);
    if (n === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(n) / Math.log(k));
    return `${parseFloat((n / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  open() {
    this.drawer()?.open();
  }

  policyLabel(value: ThumbnailStoragePolicy) {
    switch (value) {
      case 'blobStorage':
        return 'Blob Storage';
      case 'inherit':
        return 'Inherit';
      case 'onChain':
        return 'On-chain';
    }
  }

  async saveDirectoryPolicy(item: NodeItem) {
    if (!isDirectory(item) || !this.canEditDirectoryPolicy(item)) return;

    this.directoryPolicySaving.set(true);
    const draft = this.directoryPolicyDraft();
    try {
      await this.#fileListService.updateDirectoryPolicy(item.id, draft);
      toast.success('Folder settings saved');
    } catch (error) {
      console.error('Failed to update folder settings', error);
      toast.error('Failed to update folder settings', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      this.directoryPolicySaving.set(false);
    }
  }

  setThumbnailStoragePolicy(value: ThumbnailStoragePolicy | null) {
    if (!value) return;
    this.directoryPolicyDraft.update((draft) => ({
      ...draft,
      thumbnailStoragePolicy: value,
    }));
  }
}
