import { Permission } from '@rabbithole/assets';
import { ExtractVariantKeys } from '@rabbithole/core';

export type PermissionsItem = {
  permission: ExtractVariantKeys<Permission>;
  principal: string;
};
