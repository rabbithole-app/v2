import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { Principal } from '@icp-sdk/core/principal';
import { map } from 'rxjs';

import { resourceToObservable, StoragesService } from '@rabbithole/core';

export const canisterListResolver: ResolveFn<Principal[]> = () => {
  const storagesService = inject(StoragesService);

  return resourceToObservable(storagesService.storagesResource).pipe(
    map((storages) =>
      storages
        .filter((s) => s.status.type === 'Completed' && s.canisterId)
        .map((s) => s.canisterId!),
    ),
  );
};
