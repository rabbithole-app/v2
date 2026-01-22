import { CanMatchFn, UrlSegment } from '@angular/router';

import { isPrincipal } from '@rabbithole/core';

export const storageViewGuard: CanMatchFn = (_route, segments: UrlSegment[]) => {
  // For route :id, the first segment contains the id value
  const id = segments[0]?.path;

  // If id is a Principal, the route should match
  return id !== undefined && isPrincipal(id);
};
