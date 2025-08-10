import { randomInteger } from 'remeda';

import { PermissionsItem } from './permissions.model';
import { randomPrincipal } from '@rabbithole/core';

export const PERMISSIONS_DATA: PermissionsItem[] = Array.from({
  length: 10,
}).map((_, i) => ({
  principal: randomPrincipal().toString(),
  id: i,
  createdAt: new Date(),
  permission: (['Admin', 'Permissions', 'Write', 'Read'] as const)[
    randomInteger(0, 3)
  ],
}));
