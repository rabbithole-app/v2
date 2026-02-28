import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLock } from '@ng-icons/lucide';

import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmButton } from '@spartan-ng/helm/button';

import { isDirectory, isFile, NodeItem } from '../../types';

@Component({
  selector: 'rbth-feat-file-properties-dialog',
  template: `
    @let node = item;

    <hlm-dialog-header>
      <h3 hlmDialogTitle class="truncate" [title]="node.name">
        {{ node.name }}
      </h3>
      <p hlmDialogDescription>
        {{ isFileNode() ? 'File' : 'Directory' }} properties
      </p>
    </hlm-dialog-header>

    <div class="space-y-3 text-sm py-4">
      <div class="flex justify-between">
        <span class="text-muted-foreground">Type</span>
        <span>{{ isFileNode() ? 'File' : 'Directory' }}</span>
      </div>

      @if (isFileNode()) {
        <div class="flex justify-between">
          <span class="text-muted-foreground">Size</span>
          <span>{{ fileSize() }}</span>
        </div>
      }

      <div class="border-t border-border my-2"></div>

      <div class="flex justify-between items-center">
        <span class="text-muted-foreground">Encryption</span>
        <span
          class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
          [class]="
            encryptionMode() === 'encrypted'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
          "
        >
          @if (encryptionMode() === 'encrypted') {
            <ng-icon name="lucideLock" class="!size-3" />
            Encrypted
          } @else {
            Plaintext
          }
        </span>
      </div>

      @if (versionInfo(); as ver) {
        <div class="flex justify-between">
          <span class="text-muted-foreground">Versions</span>
          <span>{{ ver.count }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted-foreground">Storage</span>
          <span>{{ ver.backend }}</span>
        </div>
      }

      <div class="border-t border-border my-2"></div>

      <div class="flex justify-between">
        <span class="text-muted-foreground">Created</span>
        <span>{{ node.createdAt | date: 'short' }}</span>
      </div>

      @if (node.modifiedAt) {
        <div class="flex justify-between">
          <span class="text-muted-foreground">Modified</span>
          <span>{{ node.modifiedAt | date: 'short' }}</span>
        </div>
      }

      <div class="flex justify-between">
        <span class="text-muted-foreground">Permissions</span>
        <span>{{ node.permissions.length }} user(s)</span>
      </div>
    </div>

    <hlm-dialog-footer>
      <button hlmBtn variant="outline" (click)="dialogRef.close()">Close</button>
    </hlm-dialog-footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgIcon,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmButton,
  ],
  providers: [provideIcons({ lucideLock })],
})
export class FilePropertiesDialogComponent {
  readonly dialogRef = inject(BrnDialogRef);
  readonly item = injectBrnDialogContext<NodeItem>();

  protected readonly isFileNode = computed(() => isFile(this.item));
  protected readonly isDirNode = computed(() => isDirectory(this.item));

  protected readonly encryptionMode = computed(() => {
    const item = this.item;
    if (isFile(item)) return item.encryptionMode;
    if (isDirectory(item)) return item.defaultEncryptionMode;
    return 'encrypted';
  });

  protected readonly fileSize = computed(() => {
    const item = this.item;
    if (!isFile(item)) return '';
    const bytes = Number(item.size);
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  });

  protected readonly versionInfo = computed(() => {
    const item = this.item;
    if (!isFile(item)) return null;
    return {
      count: item.versionCount,
      current: item.currentVersion,
      backend: item.storageBackend,
    };
  });
}
