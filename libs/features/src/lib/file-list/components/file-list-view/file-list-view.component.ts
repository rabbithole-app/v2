import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFolderOpen,
  lucideFolderPlus,
  lucideFolderUp,
  lucideUpload,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { intersectionWith } from 'remeda';
import { filter, from, map, mergeWith, switchMap } from 'rxjs';

import { injectCoreWorker, ShareDialogComponent } from '@rabbithole/core';
import {
  ENCRYPTED_STORAGE_CANISTER_ID,
  injectEncryptedStorage,
  PermissionsService,
} from '@rabbithole/core/storage-runtime';
import {
  CreateStorageAccessGrants,
  Entry,
  RevokeStorageAccessGrants,
  StorageAccessRequest,
} from '@rabbithole/encrypted-storage';
import { HlmContextMenuImports } from '@spartan-ng/helm/context-menu';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';

import { GRAY_ICONS_CONFIG } from '../../constants';
import { FileListResolverData } from '../../resolvers/file-list';
import { FileListService } from '../../services';
import { FILE_LIST_ICONS_CONFIG } from '../../tokens';
import { DirectoryColor, NodeItem } from '../../types';
import { GridViewComponent } from '../grid-view/grid-view.component';
import { MoveDialogComponent } from '../move-dialog/move-dialog.component';
import { NewFolderDialogComponent } from '../new-folder-dialog/new-folder-dialog.component';
import { NoAccessEmptyComponent } from '../no-access-empty/no-access-empty.component';
import { PropertiesDrawerComponent } from '../properties-drawer/properties-drawer.component';
import { RenameDialogComponent } from '../rename-dialog/rename-dialog.component';
import {
  RequestAccessDialogComponent,
  RequestAccessDialogResult,
} from '../request-access-dialog/request-access-dialog.component';
import { UploadDrawerComponent } from '../upload-drawer/upload-drawer.component';

@Component({
  selector: 'rbth-feat-file-list-view',
  templateUrl: './file-list-view.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-0 flex-1 flex-col',
  },
  imports: [
    UploadDrawerComponent,
    GridViewComponent,
    PropertiesDrawerComponent,
    ShareDialogComponent,
    NoAccessEmptyComponent,
    NgIcon,
    HlmContextMenuImports,
    HlmDropdownMenuImports,
    HlmEmptyImports,
  ],
  providers: [
    FileListService,
    { provide: FILE_LIST_ICONS_CONFIG, useValue: GRAY_ICONS_CONFIG },
    provideIcons({
      lucideFolderPlus,
      lucideUpload,
      lucideFolderUp,
      lucideFolderOpen,
    }),
  ],
})
export class FileListViewComponent {
  accessRequest = signal<StorageAccessRequest | null>(null);
  accessRequestCancelling = signal(false);
  accessRequestRefreshing = signal(false);
  accessRequestSubmitting = signal(false);
  active = signal(false);
  canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  fileListService = inject(FileListService);
  canWrite = this.fileListService.canWrite;
  #route = inject(ActivatedRoute);
  items = toSignal(
    this.#route.data.pipe(
      map((data) => {
        const resolved = data['fileList'] as FileListResolverData;
        // Sync directoryPermission from resolver into FileListService state
        if (resolved.directoryPermission !== undefined) {
          this.fileListService.setDirectoryPermission(
            resolved.directoryPermission,
          );
        }
        this.accessRequest.set(resolved.accessRequest);
        return resolved.items;
      }),
      mergeWith(
        toObservable(this.fileListService.items.value).pipe(filter((v) => !!v)),
      ),
    ),
    { requireSync: true },
  );
  noAccess = computed(() =>
    !this.fileListService.items.isLoading() &&
    this.fileListService.directoryPermission() === null &&
    this.items().length === 0,
  );
  propertiesDrawerItems = signal<NodeItem[]>([]);
  #permissionsService = inject(PermissionsService);
  shareAccessList = this.#permissionsService.permitted;
  shareAccessListLoading = this.#permissionsService.permittedLoading;
  shareDialogItems = signal<NodeItem[]>([]);
  shareDialogScopeKind = computed(() => {
    const items = this.shareDialogItems();
    if (items.length !== 1) return 'batch';
    return items[0]!.type === 'directory' ? 'directory' : 'file';
  });
  shareDialogScopeLabel = computed(() => {
    const items = this.shareDialogItems();
    if (items.length === 0) return 'Selected item';
    if (items.length > 1) return `${items.length} selected items`;
    return this.#itemPath(items[0]!);
  });
  #coreWorkerService = injectCoreWorker();
  #destroyRef = inject(DestroyRef);
  #dialogService = inject(HlmDialogService);
  #drawerOpen = false;
  #encryptedStorage = injectEncryptedStorage();

  private readonly propertiesDrawer = viewChild(PropertiesDrawerComponent);
  private readonly shareDialog = viewChild(ShareDialogComponent);

  constructor() {
    this.#coreWorkerService.postMessage({
      action: 'worker:init-storage',
      payload: this.canisterId.toText(),
    });
    this.#route.url
      .pipe(
        map((url) => {
          const segments = url.map((segment) => segment.path);
          return segments.length > 0 ? segments.join('/') : null;
        }),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe((parentPath) =>
        this.fileListService.setParentPath(parentPath),
      );
  }

  async _handleCancelAccessRequest(request: StorageAccessRequest) {
    this.accessRequestCancelling.set(true);
    const toastId = toast.loading('Cancelling access request...');
    try {
      const cancelled = await this.#encryptedStorage().cancelAccessRequest(
        request.id,
      );
      this.accessRequest.set(cancelled);
      toast.success('Access request cancelled', { id: toastId });
    } catch (error) {
      toast.error('Could not cancel access request', {
        id: toastId,
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      this.accessRequestCancelling.set(false);
    }
  }

  _handleColor({ id, color }: { color: DirectoryColor; id: bigint; }) {
    this.fileListService.updateColor(id, color);
  }

  _handleDelete(selected: bigint[]) {
    this.fileListService.delete(selected);
  }

  _handleDownload(selected: bigint[]) {
    this.fileListService.download(selected);
  }

  _handleMakePublic(selected: bigint[]) {
    const items = this.#resolveItems(selected);
    if (items.length === 0) return;
    this.#permissionsService.createAccessGrants({
      items: items.map((item) => ({
        entry: this.#itemEntry(item),
        target: { principal: '2vxsx-fae' },
        permission: 'Read',
      })),
    });
    toast.success(
      items.length === 1
        ? `"${items[0].name}" is now public`
        : `${items.length} items are now public`,
    );
  }

  _handleManageAccess(selected: bigint[]) {
    const items = this.#resolveItems(selected);
    if (items.length === 0) return;
    this.#openShareDialog(items, 'manage');
  }

  _handleMove(selected: bigint[]) {
    const items = this.#resolveItems(selected);
    const excludePaths = items
      .filter((i) => i.type === 'directory')
      .map((i) => (i.parentPath ? `${i.parentPath}/${i.name}` : i.name));
    const currentParentPaths = [...new Set(items.map((i) => i.parentPath ?? null))];
    const dialogRef = this.#dialogService.open(MoveDialogComponent, {
      contentClass: 'min-w-[420px]',
      context: { encryptedStorage: this.#encryptedStorage(), excludePaths, currentParentPaths },
    });
    dialogRef.closed$
      .pipe(
        filter((v): v is Entry | null => v !== undefined),
        switchMap((target) =>
          from(this.fileListService.moveItems(selected, target ?? undefined)),
        ),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe();
  }

  _handleNewFolder() {
    const existingNames = this.items()
      .filter((i) => i.type === 'directory')
      .map((i) => i.name);
    const dialogRef = this.#dialogService.open(NewFolderDialogComponent, {
      contentClass: 'min-w-[420px]',
      context: { existingNames },
    });
    dialogRef.closed$
      .pipe(
        filter((v): v is string => typeof v === 'string'),
        switchMap((name) => from(this.fileListService.createFolder(name))),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe();
  }

  _handleProperties(item: NodeItem) {
    this.#openPropertiesDrawer([item]);
  }

  async _handleRefreshAccessRequest() {
    this.accessRequestRefreshing.set(true);
    try {
      const request = await this.#encryptedStorage().getMyAccessRequest();
      this.accessRequest.set(request);
      if (!request) {
        toast.info('No active access request');
      } else if ('approved' in request.status) {
        toast.success('Access request approved');
        this.fileListService.reload();
      } else if ('pending' in request.status) {
        toast.info('Access request is still pending');
      } else if ('rejected' in request.status) {
        toast.error('Access request rejected');
      } else {
        toast.info('Access request cancelled');
      }
    } catch (error) {
      toast.error('Could not check access request status', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      this.accessRequestRefreshing.set(false);
    }
  }

  _handleReloadAfterAccessApproved() {
    this.fileListService.reload();
  }

  _handleRename(selected: bigint[]) {
    if (selected.length !== 1) return;
    const item = this.items().find((i) => i.id === selected[0]);
    if (!item) return;
    const existingNames = this.items()
      .filter((i) => i.id !== item.id)
      .map((i) => i.name);
    const dialogRef = this.#dialogService.open(RenameDialogComponent, {
      contentClass: 'min-w-[420px]',
      context: { item, existingNames },
    });
    dialogRef.closed$
      .pipe(
        filter((v): v is string => typeof v === 'string'),
        switchMap((newName) =>
          from(this.fileListService.rename(item.id, newName)),
        ),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe();
  }

  _handleRequestAccess() {
    const dialogRef = this.#dialogService.open(RequestAccessDialogComponent, {
      contentClass: 'w-[min(94vw,420px)]',
    });
    dialogRef.closed$
      .pipe(
        filter((result): result is RequestAccessDialogResult => !!result),
        switchMap((result) => from(this.#submitAccessRequest(result.message))),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe();
  }

  _handleSelectionChange(selected: bigint[]) {
    if (!this.#drawerOpen) return;
    if (selected.length === 0) {
      this.propertiesDrawerItems.set([]);
      return;
    }
    const items = this.#resolveItems(selected);
    this.#updateDrawerItems(items);
  }

  _handleShare(selected: bigint[]) {
    const items = this.#resolveItems(selected);
    if (items.length === 0) return;
    this.#openShareDialog(items, 'share');
  }

  _handleShareAccessGrants(args: CreateStorageAccessGrants) {
    const items = this.shareDialogItems();
    if (items.length === 0) return;
    const expanded = items.flatMap((item) => {
      const entry = this.#itemEntry(item);
      return args.items.map((grant) => ({ ...grant, entry }));
    });
    this.#permissionsService.createAccessGrants({
      items: expanded,
    });
  }

  _handleShareCancelPendingAccessGrant(grantId: bigint) {
    this.#permissionsService.cancelPendingAccessGrant(grantId);
  }

  _handleShareRevokeAccessGrants(args: RevokeStorageAccessGrants) {
    this.#permissionsService.revokeAccessGrants(args);
  }

  #itemEntry(item: NodeItem): Entry {
    return [
      item.type === 'file' ? 'File' : 'Directory',
      this.#itemPath(item),
    ];
  }

  #itemPath(item: NodeItem): string {
    return item.parentPath ? `${item.parentPath}/${item.name}` : item.name;
  }

  #openPropertiesDrawer(items: NodeItem[]) {
    this.#drawerOpen = true;
    this.#updateDrawerItems(items);
    this.propertiesDrawer()?.open();
  }

  #openShareDialog(items: NodeItem[], tab: 'manage' | 'share') {
    if (items.length === 1) {
      this.#permissionsService.setEntry(this.#itemEntry(items[0]!));
      this.#permissionsService.loadPermitted();
    } else {
      this.#permissionsService.setEntry(null);
    }
    this.shareDialogItems.set(items);
    this.shareDialog()?.open(tab);
  }

  #resolveItems(selected: bigint[]): NodeItem[] {
    return intersectionWith(
      this.items(),
      selected,
      (item, id) => item.id === id,
    );
  }

  async #submitAccessRequest(message?: string) {
    this.accessRequestSubmitting.set(true);
    const toastId = toast.loading('Sending access request...');
    try {
      const request = await this.#encryptedStorage().requestAccess({ message });
      this.accessRequest.set(request);
      toast.success('Access request sent', {
        id: toastId,
        description: 'The owner or a manager can approve it.',
      });
    } catch (error) {
      toast.error('Could not send access request', {
        id: toastId,
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      this.accessRequestSubmitting.set(false);
    }
  }

  #updateDrawerItems(items: NodeItem[]) {
    this.propertiesDrawerItems.set(items);
  }
}
