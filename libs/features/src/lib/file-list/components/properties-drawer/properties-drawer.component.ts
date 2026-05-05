import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLock, lucideUsers } from '@ng-icons/lucide';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';
import { BrnTabsImports } from '@spartan-ng/brain/tabs';

import {
  EditPermissionFormComponent,
  EditPermissionFormTriggerDirective,
  PermissionsTableComponent,
} from '@rabbithole/core';
import { PermissionsService } from '@rabbithole/core/storage-runtime';
import {
  GrantStoragePermission,
  RevokeStoragePermission,
} from '@rabbithole/encrypted-storage';
import {
  RbthDrawerComponent,
  RbthDrawerContentComponent,
  RbthDrawerHeaderComponent,
  RbthDrawerTitleDirective,
} from '@rabbithole/ui/drawer';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';

import { isDirectory, isFile, NodeItem } from '../../types';

@Component({
  selector: 'rbth-feat-properties-drawer',
  template: `
    <rbth-drawer side="right" [hasBackdrop]="true">
      <rbth-drawer-content *brnSheetContent="let ctx">
        <rbth-drawer-header>
          <h2 rbthDrawerTitle class="truncate">
            @if (items().length === 1) {
              {{ items()[0].name }}
            } @else {
              {{ items().length }} items selected
            }
          </h2>
        </rbth-drawer-header>

        <div hlmTabs [tab]="activeTab()" class="flex-1 overflow-hidden flex flex-col">
          <div hlmTabsList>
            <button hlmTabsTrigger="info" (click)="activeTab.set('info')">
              Info
            </button>
            @if (canManage()) {
              <button hlmTabsTrigger="permissions" (click)="_openPermissionsTab()">
                Permissions
              </button>
            }
          </div>

          <div hlmTabsContent="info" class="flex-1 overflow-y-auto px-4 py-4">
            @if (singleItem(); as item) {
              <div class="space-y-3 text-sm">
                <div class="flex justify-between">
                  <span class="text-muted-foreground">Type</span>
                  <span>{{ isFileItem(item) ? 'File' : 'Directory' }}</span>
                </div>
                @if (isFileItem(item)) {
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Size</span>
                    <span>{{ formatSize(item.size) }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Content type</span>
                    <span>{{ item.contentType }}</span>
                  </div>
                }
                <div class="flex justify-between items-center">
                  <span class="text-muted-foreground">Encryption</span>
                  <span hlmBadge [variant]="encryptionBadgeVariant(item)">
                    @if (encryptionMode(item) === 'encrypted') {
                      <ng-icon name="lucideLock" class="!size-3" />
                      Encrypted
                    } @else {
                      Plaintext
                    }
                  </span>
                </div>
                @if (isFileItem(item)) {
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Versions</span>
                    <span>{{ item.versionCount }}</span>
                  </div>
                }
                <div class="border-t border-border my-2"></div>
                <div class="flex justify-between">
                  <span class="text-muted-foreground">Created</span>
                  <span>{{ item.createdAt | date: 'short' }}</span>
                </div>
                @if (item.modifiedAt) {
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Modified</span>
                    <span>{{ item.modifiedAt | date: 'short' }}</span>
                  </div>
                }
              </div>
            } @else {
              <div class="space-y-3 text-sm">
                <div class="flex justify-between">
                  <span class="text-muted-foreground">Items</span>
                  <span>{{ items().length }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-muted-foreground">Total size</span>
                  <span>{{ formatSize(totalSize()) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-muted-foreground">Types</span>
                  <span>{{ typesSummary() }}</span>
                </div>
              </div>
            }
          </div>

          <div hlmTabsContent="permissions" class="flex-1 overflow-y-auto px-4 py-4">
            @if (singleItem(); as item) {
              <core-permissions-table
                [data]="permissionsService.permitted()"
                (grant)="grantPermission($event)"
                (revoke)="revokePermission($event)"
              />
            } @else {
              <div class="text-sm text-muted-foreground mb-4">
                Batch permissions: apply to all {{ items().length }} selected
                items.
              </div>
              <core-edit-permission-form (permissionChange)="batchGrant($event)">
                <button variant="outline" size="sm" coreEditPermissionFormTrigger>
                  <ng-icon name="lucideUsers" class="!size-4" />
                  Grant to all
                </button>
              </core-edit-permission-form>
            }
          </div>
        </div>
      </rbth-drawer-content>
    </rbth-drawer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgIcon,
    BrnSheetContent,
    BrnTabsImports,
    RbthDrawerComponent,
    RbthDrawerContentComponent,
    RbthDrawerHeaderComponent,
    RbthDrawerTitleDirective,
    HlmBadge,
    HlmButton,
    HlmTabsImports,
    PermissionsTableComponent,
    EditPermissionFormComponent,
    EditPermissionFormTriggerDirective,
  ],
  providers: [provideIcons({ lucideLock, lucideUsers })],
})
export class PropertiesDrawerComponent {
  activeTab = signal<'info' | 'permissions'>('info');
  items = input.required<NodeItem[]>();
  canManage = computed(() =>
    this.items().every(({ callerPermission: p }) => p === 'ReadWriteManage'),
  );

  isFileItem = isFile;

  permissionsService = inject(PermissionsService);

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

  _openPermissionsTab() {
    this.activeTab.set('permissions');
    this.permissionsService.loadPermitted();
  }

  async batchGrant(args: Omit<GrantStoragePermission, 'entry'>) {
    for (const item of this.items()) {
      const entry = [
        item.type === 'file' ? 'File' : 'Directory',
        item.parentPath ? `${item.parentPath}/${item.name}` : item.name,
      ] as const;
      await this.permissionsService.grantPermission({
        ...args,
        entry: [...entry],
      } as GrantStoragePermission);
    }
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

  formatSize(bytes: bigint | number) {
    const n = Number(bytes);
    if (n === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(n) / Math.log(k));
    return `${parseFloat((n / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  grantPermission(args: Omit<GrantStoragePermission, 'entry'>) {
    this.permissionsService.grantPermission(args);
  }

  open(tab: 'info' | 'permissions' = 'info') {
    const resolvedTab = tab === 'permissions' && !this.canManage() ? 'info' : tab;
    this.activeTab.set(resolvedTab);
    if (resolvedTab === 'permissions') {
      this.permissionsService.loadPermitted();
    }
    this.drawer()?.open();
  }

  revokePermission(args: Omit<RevokeStoragePermission, 'entry'>) {
    this.permissionsService.revokePermission(args);
  }
}
