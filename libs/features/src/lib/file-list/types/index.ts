import { Principal } from '@dfinity/principal';

import { ExtractVariantKeys } from '@rabbithole/core';
import { DirectoryColor as DirectoryColorRaw } from '@rabbithole/declarations';
import { StoragePermission } from '@rabbithole/encrypted-storage';

export type CommonAttrs = {
  createdAt: Date;
  id: bigint;
  keyId: [Principal, Uint8Array];
  modifiedAt?: Date;
  name: string;
  parentId?: bigint;
  parentPath?: string;
  permissions: Array<[Principal, StoragePermission]>;
};

export type DirectoryColor = ExtractVariantKeys<DirectoryColorRaw>;

export type DirectoryNode = {
  color?: DirectoryColor;
  type: 'directory';
} & CommonAttrs;

export type DirectoryNodeExtended = DirectoryNode & ItemsCommonAttrs;

export type FileNode = {
  contentType: string;
  sha256?: string;
  size: bigint;
  thumbnailKey?: string;
  // downloadUrl: string;
  // encrypted: boolean;
  // thumbnailUrl?: string;
  type: 'file';
} & CommonAttrs;

export type FileNodeExtended = FileNode & ItemsCommonAttrs;

export type NodeItem = DirectoryNodeExtended | FileNodeExtended;

type ItemsCommonAttrs = {
  disabled?: boolean;
  loading?: boolean;
};

export const isDirectory = (node: NodeItem): node is DirectoryNode =>
  node.type === 'directory';

export const isFile = (node: NodeItem): node is FileNode =>
  node.type === 'file';

export type FileListIconsConfig = {
  namespace: string;
  path: string;
  value: Record<string, string[]>;
};
