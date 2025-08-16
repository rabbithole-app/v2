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
import { type } from 'arktype';
import { first, isDeepEqual, isNonNullish } from 'remeda';

import { injectCoreWorker } from '../../core/injectors';
import { Permission } from '@rabbithole/assets';
import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  ExtractVariantKeys,
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
  #injector = inject(Injector);
  storageActor = injectStorageActor({
    injector: this.#injector,
  });
  listCommitPermitted = resource<
    { permission: ExtractVariantKeys<Permission>; principalId: string }[],
    StorageCanisterActor | null
  >({
    params: () => this.storageActor(),
    loader: async ({ params: actor }) => {
      if (!actor) return [];
      const list = await actor.list_permitted({
        entry: [],
        permission: [],
      });
      return list.map(({ principal, permission }) => ({
        principalId: principal.toText(),
        permission: first(
          Object.keys(permission),
        ) as ExtractVariantKeys<Permission>,
      }));
    },
    defaultValue: [],
    equal: isDeepEqual,
  });
  #authState = inject(AUTH_SERVICE);
  hasCommitPermission = computed(() => {
    const permitted = this.listCommitPermitted.value();
    const principalId = this.#authState.principalId();
    return isNonNullish(
      permitted.find((item) => item.principalId === principalId),
    );
  });
  showTree = resource<string, StorageCanisterActor | null>({
    params: () => this.storageActor(),
    loader: async ({ params: actor }) => {
      if (!actor) return '';
      const result = await actor.show_tree();
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
      .pipe(messageByAction('upload:progress'), takeUntilDestroyed())
      .subscribe(({ payload }) => {
        this.#updateStatus(payload);
      });

    effect(() => console.log(this.listCommitPermitted.value()));
    effect(() => console.log(this.showTree.value()));
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
