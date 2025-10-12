import {
  computed,
  effect,
  inject,
  Injectable,
  resource,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { type } from 'arktype';
import { isDeepEqual, isNonNullish } from 'remeda';
import { match, P } from 'ts-pattern';

import { injectCoreWorker, injectEncryptedStorage } from '../../core/injectors';
import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  FileUploadWithStatus,
  messageByAction,
  UploadAsset,
  UploadId,
  UploadState,
  UploadStatus,
} from '@rabbithole/core';
import {
  EncryptedStorage,
  PermissionItem,
} from '@rabbithole/encrypted-storage';

type State = {
  files: FileUploadWithStatus[];
};

const INITIAL_VALUE: State = {
  files: [],
};

const showTreeSchema = type({
  ok: 'string',
})
  .or({
    err: 'string',
  })
  .pipe((result, ctx) => {
    if ('err' in result) {
      ctx.mustBe(result.err);
      return ctx.errors;
    }

    return result.ok;
  });

@Injectable()
export class UploadService {
  encryptedStorage = injectEncryptedStorage();
  listPermitted = resource<PermissionItem[], EncryptedStorage>({
    params: () => this.encryptedStorage(),
    loader: async ({ params: encryptedStorage }) =>
      await encryptedStorage.listPermitted(),
    defaultValue: [],
    equal: isDeepEqual,
  });
  #authState = inject(AUTH_SERVICE);
  hasWritePermission = computed(() => {
    const permitted = this.listPermitted.value();
    const principalId = this.#authState.principalId();
    return isNonNullish(permitted.find((item) => item.user === principalId));
  });
  showTree = resource<string, EncryptedStorage>({
    params: () => this.encryptedStorage(),
    loader: async ({ params: encryptedStorage }) => {
      // if (!actor) return '';
      const result = await encryptedStorage.showTree();
      const parsedResult = showTreeSchema(result);
      return parsedResult instanceof type.errors ? '' : parsedResult;
    },
    defaultValue: '',
  });
  #state = signal(INITIAL_VALUE);
  state = this.#state.asReadonly();
  #coreWorkerService = injectCoreWorker();

  constructor() {
    this.#coreWorkerService.workerMessage$
      .pipe(messageByAction('upload:progress-file'), takeUntilDestroyed())
      .subscribe(({ payload }) => {
        this.#updateStatus(payload);
      });

    effect(() => console.log(this.listPermitted.value()));
    effect(() => console.log(this.showTree.value()));
  }

  async addAsset(item: { file: File; path?: string }) {
    const id = crypto.randomUUID();
    this.#state.update((state) => ({
      ...state,
      files: state.files.concat({
        ...item,
        id,
        status: UploadState.NOT_STARTED,
      }),
    }));
    const arrayBuffer = await item.file.arrayBuffer();
    const config = match(item.file)
      .returnType<UploadAsset['config']>()
      .with(
        {
          type: P.union('application/gzip', 'application/x-gzip', ''),
          name: P.when((name) => name.endsWith('.gz')),
        },
        ({ name }) => ({ fileName: name, contentEncoding: 'gzip' }),
      )
      .with(
        {
          type: P.union('application/octet-stream', ''),
          name: P.when((name) => name.endsWith('.br')),
        },
        ({ name }) => ({ fileName: name, contentEncoding: 'br' }),
      )
      .otherwise(({ name }) => ({ fileName: name }));
    const payload: UploadAsset = {
      id,
      bytes: arrayBuffer,
      config,
    };
    if (item.path) {
      payload.config.path = item.path;
    }

    this.#coreWorkerService.postMessage(
      { action: 'upload:add-asset', payload },
      { transfer: [payload.bytes] },
    );
  }

  async addFile(item: { file: File; path?: string }) {
    const id = crypto.randomUUID();
    this.#state.update((state) => ({
      ...state,
      files: state.files.concat({
        ...item,
        id,
        status: UploadState.NOT_STARTED,
      }),
    }));
    const arrayBuffer = await item.file.arrayBuffer();
    const payload: UploadAsset = {
      id,
      bytes: arrayBuffer,
      config: {
        fileName: item.file.name,
        contentType: item.file.type,
      },
    };
    if (item.path) {
      payload.config.path = item.path;
    }

    this.#coreWorkerService.postMessage(
      { action: 'upload:add-file', payload },
      { transfer: [payload.bytes] },
    );
  }

  cancel(id: UploadId) {
    this.#coreWorkerService.postMessage({
      action: 'upload:cancel',
      payload: { id },
    });
  }

  remove(id: UploadId) {
    this.#state.update((state) => ({
      ...state,
      files: state.files.filter((item) => item.id !== id),
    }));
  }

  retry(id: UploadId) {
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
