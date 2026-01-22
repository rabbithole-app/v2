import { fromNullable, uint8ArrayToHexString } from '@dfinity/utils';
import { match, P } from 'ts-pattern';

import { timeInNanosToDate } from '@rabbithole/core';
import { NodeDetails } from '@rabbithole/declarations';
import { StoragePermission } from '@rabbithole/encrypted-storage';

import {
  CommonAttrs,
  DirectoryColor,
  DirectoryNode,
  FileNode,
  NodeItem,
} from '../types';

export function convertToNodeItem(
  node: NodeDetails,
  parentPath?: string,
): NodeItem {
  const commonAttrs: CommonAttrs = {
    id: node.id,
    keyId: [node.keyId[0], new Uint8Array(node.keyId[1])],
    createdAt: timeInNanosToDate(node.createdAt),
    name: node.name,
    permissions: node.permissions.map(([principal, permission]) => [
      principal,
      Object.keys(permission)[0] as StoragePermission,
    ]),
  };

  const parentId = fromNullable(node.parentId);
  if (parentId) {
    commonAttrs.parentId = parentId;
  }

  if (parentPath) {
    commonAttrs.parentPath = parentPath;
  }

  const modifiedAt = fromNullable(node.modifiedAt);
  if (modifiedAt) {
    commonAttrs.modifiedAt = timeInNanosToDate(modifiedAt);
  }

  return match(node.metadata)
    .returnType<DirectoryNode | FileNode>()
    .with({ File: P.select() }, (file) => {
      const hash = fromNullable(file.sha256);
      return {
        ...commonAttrs,
        type: 'file',
        contentType: file.contentType,
        sha256: hash ? uint8ArrayToHexString(hash) : undefined,
        size: file.size,
        thumbnailKey: fromNullable(file.thumbnailKey),
      };
    })
    .with({ Directory: P.select() }, (directory) => {
      const color = fromNullable(directory.color);
      const dir: DirectoryNode = {
        ...commonAttrs,
        type: 'directory',
      };

      if (color) {
        dir.color = Object.keys(color)[0] as DirectoryColor;
      }

      return dir;
    })
    .exhaustive();
}
