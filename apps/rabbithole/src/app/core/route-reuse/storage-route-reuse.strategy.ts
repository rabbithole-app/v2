import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
} from '@angular/router';

@Injectable()
export class StorageRouteReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(
    future: ActivatedRouteSnapshot,
    current: ActivatedRouteSnapshot,
  ): boolean {
    if (!super.shouldReuseRoute(future, current)) {
      return false;
    }

    const futureStorageId = storageIdFromRoute(future);
    const currentStorageId = storageIdFromRoute(current);

    return (
      futureStorageId === null ||
      currentStorageId === null ||
      futureStorageId === currentStorageId
    );
  }
}

function storageIdFromRoute(route: ActivatedRouteSnapshot): string | null {
  let currentRoute: ActivatedRouteSnapshot | null = route;

  while (currentRoute) {
    const storageId = currentRoute.paramMap.get('id');
    if (storageId) return storageId;
    currentRoute = currentRoute.parent;
  }

  return null;
}
