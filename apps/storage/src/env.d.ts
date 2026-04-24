interface ImportMeta {
  readonly env: Readonly<ImportMetaEnv>;
}

interface ImportMetaEnv {
  NODE_ENV?: string;
}
