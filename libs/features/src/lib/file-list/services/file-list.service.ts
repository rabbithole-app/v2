import { computed, inject, Injectable, resource, signal } from '@angular/core';
import { AsyncQueuer, AsyncQueuerState } from '@tanstack/pacer';
import { toast } from 'ngx-sonner';
import { intersectionWith, partition } from 'remeda';
import { map, mergeAll, Subject } from 'rxjs';
import { match, P } from 'ts-pattern';

import {
    DownloadService,
    ENCRYPTED_STORAGE_CANISTER_ID,
    FileSystemAccessService,
    FileSystemDirectoryItem,
    FileSystemFileItem,
    formatBytes,
    injectCoreWorker,
    injectEncryptedStorage,
} from '@rabbithole/core';
import { EncryptedStorage, Entry, StoragePermission } from '@rabbithole/encrypted-storage';

import { NodeItem } from '../types';
import { convertToNodeItem } from '../utils';

type State = {
  deleting: { ids: bigint[]; toastId: number | null };
  parentPath: string | null;
  directoryPermission: StoragePermission | null;
};

function handleDeleteQueuerState(
  state: AsyncQueuerState<{ item: NodeItem; toastId: number | string }>,
  id: number | string,
) {
  match(state)
    .with({ isIdle: true, errorCount: 0 }, (state) =>
      toast.success(`${state.successCount} items deleted successfully`, { id }),
    )
    .with({ isIdle: true, successCount: 0 }, (state) =>
      toast.error(`${state.errorCount} items failed to delete`, { id }),
    )
    .with(
      {
        isIdle: true,
        errorCount: P.number.gt(0),
        successCount: P.number.gt(0),
      },
      (state) =>
        toast.warning(
          `Partially deleted ${state.successCount} of ${state.addItemCount} items. ${state.errorCount} items failed to delete`,
          { id },
        ),
    )
    .otherwise((state) =>
      toast.loading(
        `Processing ${state.settledCount} of ${state.addItemCount} items...`,
        { id },
      ),
    );
}

@Injectable()
export class FileListService {
  #directories = new Subject<FileSystemDirectoryItem[]>();
  directories$ = this.#directories.asObservable().pipe(
    mergeAll(),
    map((item) =>
      item.parentPath ? `${item.parentPath}/${item.name}` : item.name,
    ),
  );
  encryptedStorage = injectEncryptedStorage();
  #canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  #coreWorkerService = injectCoreWorker();
  #downloadService = inject(DownloadService);
  #files = new Subject<FileSystemFileItem[]>();
  files$ = this.#files.asObservable().pipe(mergeAll());
  #state = signal<State>({
    deleting: { ids: [], toastId: null },
    parentPath: null,
    directoryPermission: null,
  });
  #parentPath = computed(() => this.#state().parentPath);
  items = resource<
    NodeItem[],
    { encryptedStorage: EncryptedStorage; path: string | null }
  >({
    params: () => ({
      encryptedStorage: this.encryptedStorage(),
      path: this.#parentPath(),
    }),
    loader: async ({ params: { encryptedStorage, path } }) => {
      const { entries, directoryPermission } = await encryptedStorage.list(
        path ? ['Directory', path] : undefined,
      );
      const permRaw = directoryPermission.length > 0 ? directoryPermission[0] : null;
      this.#state.update((s) => ({
        ...s,
        directoryPermission: permRaw
          ? (Object.keys(permRaw)[0] as StoragePermission)
          : null,
      }));
      return entries.map((v) => convertToNodeItem(v, path ?? undefined));
    },
    defaultValue: [],
  });
  state = this.#state.asReadonly();
  directoryPermission = computed(() => this.#state().directoryPermission);
  canWrite = computed(() => {
    const perm = this.directoryPermission();
    return perm === 'ReadWrite' || perm === 'ReadWriteManage';
  });
  #fsAccessService = inject(FileSystemAccessService);

  async createFolder(name: string) {
    const parentPath = this.#parentPath();
    const path = parentPath ? `${parentPath}/${name}` : name;
    await this.encryptedStorage().createDirectory(path);
    this.reload();
  }

  async delete(selected: bigint[]) {
    const items = intersectionWith(
      this.items.value(),
      selected,
      (item, id) => item.id === id,
    );
    const toastId = toast.loading(`Deleting ${items.length} items...`);
    const _queuer = new AsyncQueuer<{
      item: NodeItem;
      toastId: number | string;
    }>(
      ({ item }) => {
        const entry: Entry = [
          item.type === 'file' ? 'File' : 'Directory',
          item.parentPath ? `${item.parentPath}/${item.name}` : item.name,
        ];
        return this.encryptedStorage().delete(entry);
      },
      {
        initialItems: items.map((item) => ({ item, toastId })),
        concurrency: 2,
        key: 'delete-processor',
        started: true,
        throwOnError: false,
        onSettled: ({ toastId: id }, queuer) => {
          handleDeleteQueuerState(queuer.store.state, id);
        },
        onSuccess: () => this.reload(),
      },
    );
    // TODO: subscribe to queuer state and sync with state signal
  }

  async download(selected: bigint[]) {
    const items = intersectionWith(
      this.items.value(),
      selected,
      (item, id) => item.id === id,
    );
    const storageId = this.#canisterId.toText();
    const AES_GCM_OVERHEAD = 28;

    const fileItems = items.filter((item) => item.type === 'file');
    if (fileItems.length === 0) return;

    if (fileItems.length === 1) {
      const item = fileItems[0];
      const path = item.parentPath
        ? `${item.parentPath}/${item.name}`
        : item.name;
      const fileSize = item.encryptionMode === 'encrypted'
        ? Number(item.size) - AES_GCM_OVERHEAD * item.chunkCount
        : Number(item.size);
      await this.#downloadService.startDownload(
        {
          id: crypto.randomUUID(),
          storageId,
          entry: ['File', path],
          encrypted: item.encryptionMode === 'encrypted',
          fileName: item.name,
          contentType: item.contentType,
          totalChunks: item.chunkCount,
          keyId: [item.keyId[0].toText(), Array.from(item.keyId[1])],
          storageBackend: item.storageBackend,
        },
        this.#coreWorkerService,
        fileSize,
      );
    } else {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const archiveName = `archive-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.zip`;

      const fileSizes = fileItems.map((item) =>
        item.encryptionMode === 'encrypted'
          ? Number(item.size) - AES_GCM_OVERHEAD * item.chunkCount
          : Number(item.size),
      );
      const totalSize = fileSizes.reduce((a, b) => a + b, 0);
      const toastId = toast.loading(
        `Downloading 0/${fileItems.length} files (0 / ${formatBytes(totalSize)})`,
      );

      await this.#downloadService.startArchiveDownload(
        {
          id: crypto.randomUUID(),
          storageId,
          archiveName,
          files: fileItems.map((item, i) => {
            const path = item.parentPath
              ? `${item.parentPath}/${item.name}`
              : item.name;
            return {
              entry: ['File' as const, path],
              encrypted: item.encryptionMode === 'encrypted',
              fileName: item.name,
              contentType: item.contentType,
              totalChunks: item.chunkCount,
              fileSize: fileSizes[i],
              keyId: [item.keyId[0].toText(), Array.from(item.keyId[1])] as [string, number[]],
              storageBackend: item.storageBackend,
            };
          }),
        },
        this.#coreWorkerService,
        (progress) => {
          if (progress.status === 'downloading') {
            const downloadedSize = fileSizes
              .slice(0, progress.currentFileIndex)
              .reduce((a, b) => a + b, 0);
            toast.loading(
              `Downloading ${progress.currentFileIndex + 1}/${progress.totalFiles} files (${formatBytes(downloadedSize)} / ${formatBytes(totalSize)})`,
              { id: toastId },
            );
          } else if (progress.status === 'completed') {
            toast.success('Archive downloaded', { id: toastId });
          } else if (progress.status === 'failed') {
            toast.error('Archive download failed', {
              id: toastId,
              description: progress.errorMessage,
            });
          } else if (progress.status === 'canceled') {
            toast.info('Archive download canceled', { id: toastId });
          }
        },
      );
    }
  }

  async openDirectoryDialog() {
    const items = await this.#fsAccessService.list();
    const [fileItems, directoryItems] = partition(
      items,
      (item) => item.kind === 'file',
    );
    this.#files.next(fileItems);
    this.#directories.next(directoryItems);
  }

  async openFileDialog() {
    const fileHandles = await this.#fsAccessService.fileOpen({
      multiple: true,
    });
    const items = await Promise.all(
      match(fileHandles)
        .with(P.array({ handle: P.nonNullable.select() }), (v) =>
          v.map((f) => f.getFile()),
        )
        .with({ handle: P.nonNullable.select() }, (f) => [f.getFile()])
        .run(),
    );
    const fileItems = items.map<FileSystemFileItem>((file) => ({
      file,
      kind: 'file',
      name: file.name,
      // TODO: add parent path
    }));
    this.#files.next(fileItems);
  }

  async moveItems(selected: bigint[], targetDir?: Entry) {
    const items = intersectionWith(
      this.items.value(),
      selected,
      (item, id) => item.id === id,
    );
    const toastId = toast.loading(`Moving ${items.length} items...`);
    let successCount = 0;
    let errorCount = 0;
    for (const item of items) {
      const entry: Entry = [
        item.type === 'file' ? 'File' : 'Directory',
        item.parentPath ? `${item.parentPath}/${item.name}` : item.name,
      ];
      try {
        await this.encryptedStorage().move(entry, targetDir);
        successCount++;
      } catch {
        errorCount++;
      }
    }
    if (errorCount === 0) {
      toast.success(`${successCount} items moved`, { id: toastId });
    } else {
      toast.warning(`Moved ${successCount}, failed ${errorCount}`, {
        id: toastId,
      });
    }
    this.reload();
  }

  async rename(itemId: bigint, newName: string) {
    const item = this.items.value().find((i) => i.id === itemId);
    if (!item) return;
    const currentPath = item.parentPath
      ? `${item.parentPath}/${item.name}`
      : item.name;
    const entry: Entry = [
      item.type === 'file' ? 'File' : 'Directory',
      currentPath,
    ];
    await this.encryptedStorage().rename(entry, newName);
    this.reload();
  }

  async updateColor(itemId: bigint, color: string) {
    const item = this.items.value().find((i) => i.id === itemId);
    if (!item || item.type !== 'directory') return;
    const path = item.parentPath
      ? `${item.parentPath}/${item.name}`
      : item.name;
    await this.encryptedStorage().updateDirectoryColor(path, color);
    this.reload();
  }

  reload() {
    this.items.reload();
  }

  setDirectoryPermission(permission: StoragePermission | null) {
    this.#state.update((s) => ({ ...s, directoryPermission: permission }));
  }

  setParentPath(parentPath: string | null) {
    this.#state.set({
      ...this.#state(),
      parentPath,
    });
  }
}
