import {
  ChangeDetectionStrategy,
  Component,
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
import { filter, map, mergeWith } from 'rxjs';

import { injectCoreWorker } from '@rabbithole/core';
import {
  ENCRYPTED_STORAGE_CANISTER_ID,
  injectEncryptedStorage,
  PermissionsService,
} from '@rabbithole/core/storage-runtime';
import { Entry } from '@rabbithole/encrypted-storage';
import { toast } from 'ngx-sonner';
import { intersectionWith } from 'remeda';
import { HlmContextMenuImports } from '@spartan-ng/helm/context-menu';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';

import { GRAY_ICONS_CONFIG } from '../../constants';
import { FileListService } from '../../services';
import { FILE_LIST_ICONS_CONFIG } from '../../tokens';
import { DirectoryColor, NodeItem } from '../../types';
import { FileListResolverData } from '../../resolvers/file-list';
import { GridViewComponent } from '../grid-view/grid-view.component';
import { MoveDialogComponent } from '../move-dialog/move-dialog.component';
import { NewFolderDialogComponent } from '../new-folder-dialog/new-folder-dialog.component';
import { PropertiesDrawerComponent } from '../properties-drawer/properties-drawer.component';
import { RenameDialogComponent } from '../rename-dialog/rename-dialog.component';
import { UploadDrawerComponent } from '../upload-drawer/upload-drawer.component';

@Component({
  selector: 'rbth-feat-file-list-view',
  templateUrl: './file-list-view.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col flex-1',
  },
  imports: [
    UploadDrawerComponent,
    GridViewComponent,
    PropertiesDrawerComponent,
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
  active = signal(false);
  canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  fileListService = inject(FileListService);
  canWrite = this.fileListService.canWrite;
  propertiesDrawerItems = signal<NodeItem[]>([]);
  #dialogService = inject(HlmDialogService);
  #encryptedStorage = injectEncryptedStorage();
  #permissionsService = inject(PermissionsService);
  private readonly propertiesDrawer = viewChild(PropertiesDrawerComponent);
  #route = inject(ActivatedRoute);
  items = toSignal(
    this.#route.data.pipe(
      map((data) => {
        const resolved = data['fileList'] as FileListResolverData;
        // Sync directoryPermission from resolver into FileListService state
        if (resolved.directoryPermission !== undefined) {
          this.fileListService.setDirectoryPermission(resolved.directoryPermission);
        }
        return resolved.items;
      }),
      mergeWith(
        toObservable(this.fileListService.items.value).pipe(filter((v) => !!v)),
      ),
    ),
    { requireSync: true },
  );
  #coreWorkerService = injectCoreWorker();

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
        takeUntilDestroyed(),
      )
      .subscribe((parentPath) =>
        this.fileListService.setParentPath(parentPath),
      );
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
      .pipe(filter((v): v is string => typeof v === 'string'))
      .subscribe((name) => this.fileListService.createFolder(name));
  }

  _handleColor({ id, color }: { id: bigint; color: DirectoryColor }) {
    this.fileListService.updateColor(id, color);
  }

  _handleDelete(selected: bigint[]) {
    this.fileListService.delete(selected);
  }

  _handleDownload(selected: bigint[]) {
    this.fileListService.download(selected);
  }

  _handleManageAccess(selected: bigint[]) {
    const items = this.#resolveItems(selected);
    if (items.length === 0) return;
    this.#openPropertiesDrawer(items, 'permissions');
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

  _handleMakePublic(selected: bigint[]) {
    const items = this.#resolveItems(selected);
    if (items.length === 0) return;
    for (const item of items) {
      const entryType = item.type === 'file' ? 'File' : 'Directory';
      const path = item.parentPath
        ? `${item.parentPath}/${item.name}`
        : item.name;
      this.#permissionsService.setEntry([entryType, path]);
      this.#permissionsService.grantPermission({
        user: '2vxsx-fae',
        permission: 'Read',
      });
    }
    toast.success(
      items.length === 1
        ? `"${items[0].name}" is now public`
        : `${items.length} items are now public`,
    );
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
      .pipe(filter((v): v is Entry | null => v !== undefined))
      .subscribe((target) =>
        this.fileListService.moveItems(selected, target ?? undefined),
      );
  }

  _handleProperties(item: NodeItem) {
    this.#openPropertiesDrawer([item], 'info');
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
      .pipe(filter((v): v is string => typeof v === 'string'))
      .subscribe((newName) =>
        this.fileListService.rename(item.id, newName),
      );
  }

  #drawerOpen = false;

  #openPropertiesDrawer(items: NodeItem[], tab: 'info' | 'permissions') {
    this.#drawerOpen = true;
    this.#updateDrawerItems(items);
    this.propertiesDrawer()?.open(tab);
  }

  #updateDrawerItems(items: NodeItem[]) {
    if (items.length === 1) {
      const item = items[0];
      const entryType = item.type === 'file' ? 'File' : 'Directory';
      const path = item.parentPath
        ? `${item.parentPath}/${item.name}`
        : item.name;
      this.#permissionsService.setEntry([entryType, path]);
    } else {
      this.#permissionsService.setEntry(null);
    }
    this.propertiesDrawerItems.set(items);
  }

  #resolveItems(selected: bigint[]): NodeItem[] {
    return intersectionWith(
      this.items(),
      selected,
      (item, id) => item.id === id,
    );
  }
}
