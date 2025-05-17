import { BreakpointObserver } from '@angular/cdk/layout';
import { assertInInjectionContext, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

export const MOBILE_BREAKPOINT = 768;

export function injectIsMobile() {
  assertInInjectionContext(injectIsMobile);

  const breakpointObserver = inject(BreakpointObserver);

  return toSignal(
    breakpointObserver
      .observe(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
      .pipe(map((state) => state.matches))
  );
}
