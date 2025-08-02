import { Principal } from '@dfinity/principal';
import { type } from 'arktype';

import { Prettify } from './utility';

export const uploadFileSchema = type({
  id: 'string.uuid.v4',
  bytes: 'ArrayBuffer',
  config: {
    'contentEncoding?': "'br' | 'compress' | 'deflate' | 'gzip' | 'identity'",
    'contentType?': 'string',
    fileName: 'string>=1',
    'headers?': type(['string', 'string']).array(),
    'path?': 'string',
  },
  'metadata?': {
    'encryption?': 'boolean',
  },
});

export const fileIdSchema = uploadFileSchema.pick('id');

const httpAgentOptionsSchema = type({
  'host?': 'string',
  'retryTimes?': 'number',
  'verifyQuerySignatures?': 'boolean',
});

const principalSchema = type('string').narrow((value, ctx) => {
  try {
    Principal.fromText(value);
    return true;
  } catch (error) {
    return ctx.reject((error as Error).message);
  }
});
// .pipe(Principal.fromText);

export const workerConfigSchema = type({
  httpAgentOptions: httpAgentOptionsSchema.and({
    'shouldFetchRootKey?': 'boolean',
  }),
  // canisters: type.Record("'assets'", principalSchema),
  canisters: {
    assets: principalSchema,
  },
});

export type CoreWorkerActionsIn = Prettify<
  {
    'fs:load-list': unknown;
    'upload:add': { payload: UploadFile };
    'upload:cancel': { payload: Pick<UploadFile, 'id'> };
    'upload:remove': { payload: Pick<UploadFile, 'id'> };
    'upload:retry': { payload: Pick<UploadFile, 'id'> };
    'worker:config': { payload: WorkerConfigIn };
  } & WorkerActionsIn
>;
export type CoreWorkerActionsOut = Prettify<
  {
    'fs:list': { payload: unknown };
    'upload:progress': { payload: UploadStatus };
  } & WorkerActionsOut
>;

export type CoreWorkerMessageIn = Message<CoreWorkerActionsIn>;

export type CoreWorkerMessageOut = Message<CoreWorkerActionsOut>;

export type CoreWorkerMessages = CoreWorkerMessageIn | CoreWorkerMessageOut;

// export type MessagePayload<
//   T extends Record<string, unknown>,
//   K extends keyof T,
// > = T[K] extends { payload: infer P } ? P : never;

export type EventName<
  Namespace extends string,
  Action extends string,
> = `${Namespace}:${Action}`;

export type ExtractPayloadByAction<T, A> = T extends {
  action: A;
  payload: infer P;
}
  ? P
  : never;

export type Message<T extends Record<string, any>> = Prettify<
  {
    [K in keyof T]: { action: K } & T[K];
  }[keyof T]
>;
export type UploadFile = typeof uploadFileSchema.infer;

export type UploadStatus = {
  id: string;
} & (
  | { current: number; status: 'processing'; total: number }
  | { errorMessage: string; status: 'failed' }
  | { status: 'calchash' | 'commit' | 'done' | 'pending' }
);
export type WorkerActionsIn = {
  'worker:config': { payload?: any };
};

export type WorkerActionsOut = {
  'worker:init': unknown;
  'worker:signOut': unknown;
};
export type WorkerConfig = typeof workerConfigSchema.infer;

export type WorkerConfigIn = typeof workerConfigSchema.inferIn;

export type WorkerMessageIn = Message<WorkerActionsIn>;

export type WorkerMessageOut = Message<WorkerActionsOut>;

export type WorkerMessages = WorkerMessageIn | WorkerMessageOut;
