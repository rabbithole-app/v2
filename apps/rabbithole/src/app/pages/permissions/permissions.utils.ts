import { first } from 'remeda';
import { match, P } from 'ts-pattern';

import { PermissionsItem } from '../../widgets/permissions-table/permissions-table.model';
import { TreeNode as TreeNodeRaw } from '@rabbithole/assets';
import { Permission, PermissionInfo } from '@rabbithole/assets';
import { ExtractVariantKeys } from '@rabbithole/core';
import { TreeNode } from '@rabbithole/ui';

export function convertPermissionInfoItems(
  items: PermissionInfo[],
): PermissionsItem[] {
  return items.map(({ principal, permission }) => ({
    principal: principal.toText(),
    permission: first(
      Object.keys(permission),
    ) as ExtractVariantKeys<Permission>,
  }));
}

export function convertTreeNodes(
  items: TreeNodeRaw[],
  prefix?: string,
): TreeNode[] {
  return items.map((node) =>
    match(node)
      .returnType<TreeNode>()
      .with(
        {
          name: P.string.select('name'),
          children: [P.array().select('children')],
        },
        ({ name, children }) => {
          const path = prefix ? `${prefix}/${name}` : name;
          return { name, path, children: convertTreeNodes(children, path) };
        },
      )
      .with({ name: P.string.select('name') }, ({ name }) => {
        const path = prefix ? `${prefix}/${name}` : name;
        return { name, path };
      })
      .exhaustive(),
  );
}
