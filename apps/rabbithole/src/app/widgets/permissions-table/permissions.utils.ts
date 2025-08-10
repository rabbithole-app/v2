import { first } from 'remeda';

import { PermissionsItem } from './permissions.model';
import { Permission, PermissionInfo } from '@rabbithole/assets';
import { ExtractVariantKeys } from '@rabbithole/core';

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
