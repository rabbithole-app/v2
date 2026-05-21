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
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLock } from '@ng-icons/lucide';
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
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmSelectImports } from '@spartan-ng/helm/select';

import { FileListService } from '../../services';
import {
  DirectoryEncryptionPolicy,
  isDirectory,
  isFile,
  NodeItem,
  ThumbnailEncryptionPolicy,
  ThumbnailStoragePolicy,
} from '../../types';

type DirectoryPolicyDraft = {
  encryptionPolicy: DirectoryEncryptionPolicy;
  thumbnailEncryptionPolicy: ThumbnailEncryptionPolicy;
  thumbnailStoragePolicy: ThumbnailStoragePolicy;
};

const defaultPolicyDraft: DirectoryPolicyDraft = {
  encryptionPolicy: 'auto',
  thumbnailEncryptionPolicy: 'inherit',
  thumbnailStoragePolicy: 'inherit',
};

@Component({
  selector: 'rbth-feat-properties-drawer',
  templateUrl: "./properties-drawer.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgIcon,
    BrnSheetContent,
    RbthDrawerComponent,
    RbthDrawerContentComponent,
    RbthDrawerHeaderComponent,
    RbthDrawerTitleDirective,
    HlmBadge,
    HlmButton,
    HlmFieldImports,
    CoreTransparentSelectBackdropDirective,
    BrnSelectImports,
    HlmSelectImports,
  ],
  providers: [provideIcons({ lucideLock })],
})
export class PropertiesDrawerComponent {
  readonly #fileListService = inject(FileListService);

  readonly directoryPolicyDraft =
    signal<DirectoryPolicyDraft>(defaultPolicyDraft);

  readonly directoryPolicySaving = signal(false);

  readonly encryptionPolicyOptions = [
    { value: 'auto', label: 'Auto', description: 'Inherit from parent folder' },
    {
      value: 'encrypted',
      label: 'Encrypted',
      description: 'New files require vetKeys',
    },
    {
      value: 'plaintext',
      label: 'Plaintext',
      description: 'New files do not use encryption',
    },
  ] as const;

  readonly thumbnailEncryptionPolicyOptions = [
    { value: 'inherit', label: 'Inherit', description: 'Inherit from parent folder' },
    {
      value: 'followFile',
      label: 'Follow file',
      description: 'Use the file encryption mode',
    },
  ] as const;

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

  isFileItem = isFile;
  isDirectoryItem = isDirectory;

  items = input.required<NodeItem[]>();

  singleItem = computed(() =>
    this.items().length === 1 ? this.items()[0] : null,
  );

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
        encryptionPolicy: item.encryptionPolicy,
        thumbnailEncryptionPolicy: item.thumbnailEncryptionPolicy,
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
    return draft.encryptionPolicy !== item.encryptionPolicy
      || draft.thumbnailEncryptionPolicy !== item.thumbnailEncryptionPolicy
      || draft.thumbnailStoragePolicy !== item.thumbnailStoragePolicy;
  }

  encryptionBadgeVariant(item: NodeItem) {
    return this.encryptionMode(item) === 'encrypted'
      ? ('default' as const)
      : ('secondary' as const);
  }

  encryptionMode(item: NodeItem) {
    if (isFile(item)) return item.encryptionMode;
    if (isDirectory(item)) return item.defaultEncryptionMode;
    return 'encrypted';
  }

  policyLabel(
    value:
      | DirectoryEncryptionPolicy
      | ThumbnailEncryptionPolicy
      | ThumbnailStoragePolicy,
  ) {
    switch (value) {
      case 'auto':
        return 'Auto';
      case 'inherit':
        return 'Inherit';
      case 'encrypted':
        return 'Encrypted';
      case 'plaintext':
        return 'Plaintext';
      case 'followFile':
        return 'Follow file';
      case 'onChain':
        return 'On-chain';
      case 'blobStorage':
        return 'Blob Storage';
    }
  }

  setEncryptionPolicy(value: DirectoryEncryptionPolicy | null) {
    if (!value) return;
    this.directoryPolicyDraft.update((draft) => ({
      ...draft,
      encryptionPolicy: value,
    }));
  }

  setThumbnailEncryptionPolicy(value: ThumbnailEncryptionPolicy | null) {
    if (!value) return;
    this.directoryPolicyDraft.update((draft) => ({
      ...draft,
      thumbnailEncryptionPolicy: value,
    }));
  }

  setThumbnailStoragePolicy(value: ThumbnailStoragePolicy | null) {
    if (!value) return;
    this.directoryPolicyDraft.update((draft) => ({
      ...draft,
      thumbnailStoragePolicy: value,
    }));
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
}
