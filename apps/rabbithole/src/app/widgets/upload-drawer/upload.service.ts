import {
  computed,
  effect,
  inject,
  Injectable,
  Injector,
  resource,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { isDeepEqual } from 'remeda';

import { injectCoreWorker } from '../../core/injectors';
import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  FileUploadWithStatus,
  injectStorageActor,
  messageByAction,
  StorageCanisterActor,
  UploadFile,
  UploadStatus,
} from '@rabbithole/core';

type State = {
  // assetManager: AssetManager | null;
  files: FileUploadWithStatus[];
  // hasCommitPermission: boolean;
  // error: ParsedAgentError | null;
};

const INITIAL_VALUE: State = {
  files: [],
};

@Injectable()
export class UploadService {
  #injector = inject(Injector);
  storageActor = injectStorageActor({
    injector: this.#injector,
  });
  listCommitPermitted = resource<string[], StorageCanisterActor | null>({
    params: () => this.storageActor(),
    loader: async ({ params: actor }) => {
      if (!actor) return [];
      const list = await actor.list_permitted({ permission: { Commit: null } });
      return list.map((principalId) => principalId.toText());
    },
    defaultValue: [],
    equal: isDeepEqual,
  });
  #authState = inject(AUTH_SERVICE);
  hasCommitPermission = computed(() => {
    const permitted = this.listCommitPermitted.value();
    const principalId = this.#authState.principalId();
    return permitted.includes(principalId);
  });
  #state = signal(INITIAL_VALUE);
  state = this.#state.asReadonly();
  #coreWorkerService = injectCoreWorker();

  constructor() {
    this.#coreWorkerService.workerMessage$
      .pipe(messageByAction('upload:progress'), takeUntilDestroyed())
      .subscribe(({ payload }) => {
        this.#updateStatus(payload);
      });

    effect(() => console.log(this.listCommitPermitted.value()));
  }

  async addFile(item: { file: File; path?: string }) {
    const id = crypto.randomUUID();
    this.#state.update((state) => ({
      ...state,
      files: state.files.concat({
        ...item,
        id,
        status: 'pending',
      }),
    }));
    const arrayBuffer = await item.file.arrayBuffer();
    const payload: UploadFile = {
      id,
      bytes: arrayBuffer,
      config: {
        fileName: item.file.name,
      },
    };
    if (item.path) {
      payload.config.path = item.path;
    }

    this.#coreWorkerService.postMessage(
      { action: 'upload:add', payload },
      { transfer: [payload.bytes] },
    );
  }

  cancel(id: UploadFile['id']) {
    this.#coreWorkerService.postMessage({
      action: 'upload:cancel',
      payload: { id },
    });
  }

  remove(id: UploadFile['id']) {
    this.#state.update((state) => ({
      ...state,
      files: state.files.filter((item) => item.id !== id),
    }));
  }

  retry(id: UploadFile['id']) {
    this.#coreWorkerService.postMessage({
      action: 'upload:retry',
      payload: { id },
    });
  }

  #updateStatus(value: UploadStatus) {
    this.#state.update((state) => ({
      ...state,
      files: state.files.map((item) => {
        if (item.id === value.id) {
          return { ...item, ...value };
        }
        return item;
      }),
    }));
  }
}
