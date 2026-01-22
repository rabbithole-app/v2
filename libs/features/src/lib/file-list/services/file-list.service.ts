import { computed, inject, Injectable, resource, signal } from '@angular/core';
import { AsyncQueuer, AsyncQueuerState } from '@tanstack/pacer';
import { saveAs } from 'file-saver';
import { toast } from 'ngx-sonner';
import { intersectionWith, partition } from 'remeda';
import { map, mergeAll, Subject } from 'rxjs';
import { match, P } from 'ts-pattern';

import {
    FileSystemAccessService,
    FileSystemDirectoryItem,
    FileSystemFileItem,
    injectEncryptedStorage,
} from '@rabbithole/core';
import { EncryptedStorage, Entry } from '@rabbithole/encrypted-storage';

import { NodeItem } from '../types';
import { convertToNodeItem } from '../utils';

type State = {
  deleting: { ids: bigint[]; toastId: number | null };
  parentPath: string | null;
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
  #files = new Subject<FileSystemFileItem[]>();
  files$ = this.#files.asObservable().pipe(mergeAll());
  #state = signal<State>({
    deleting: { ids: [], toastId: null },
    parentPath: null,
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
      const nodes = await encryptedStorage.list(
        path ? ['Directory', path] : undefined,
      );
      return nodes.map((v) => convertToNodeItem(v, path ?? undefined));
    },
    defaultValue: [],
  });
  state = this.#state.asReadonly();
  #fsAccessService = inject(FileSystemAccessService);

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

  download(selected: bigint[]) {
    const items = intersectionWith(
      this.items.value(),
      selected,
      (item, id) => item.id === id,
    );
    const _queuer = new AsyncQueuer<NodeItem>(
      async (item) => {
        const blob = await this.encryptedStorage().get(item.keyId);
        saveAs(blob, item.name);
      },
      {
        initialItems: items,
        concurrency: 2,
        key: 'download-processor',
        started: true,
        throwOnError: false,
      },
    );
    // TODO: subscribe to queuer state and sync with state signal
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

  reload() {
    this.items.reload();
  }

  setParentPath(parentPath: string | null) {
    this.#state.set({
      ...this.#state(),
      parentPath,
    });
  }
}
