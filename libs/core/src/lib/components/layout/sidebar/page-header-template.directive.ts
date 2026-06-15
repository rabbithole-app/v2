import { DestroyRef, Directive, inject, TemplateRef } from '@angular/core';

import { PageHeaderService } from './page-header.service';

@Directive({
  selector: 'ng-template[rbthCorePageHeaderActions]',
})
export class PageHeaderActionsDirective {
  readonly #destroyRef = inject(DestroyRef);
  readonly #pageHeader = inject(PageHeaderService);
  readonly #templateRef = inject<TemplateRef<unknown>>(TemplateRef);

  constructor() {
    const unregister = this.#pageHeader.setActionsTemplate(this.#templateRef);
    this.#destroyRef.onDestroy(unregister);
  }
}

@Directive({
  selector: 'ng-template[rbthCorePageHeaderContext]',
})
export class PageHeaderContextDirective {
  readonly #destroyRef = inject(DestroyRef);
  readonly #pageHeader = inject(PageHeaderService);
  readonly #templateRef = inject<TemplateRef<unknown>>(TemplateRef);

  constructor() {
    const unregister = this.#pageHeader.setContextTemplate(this.#templateRef);
    this.#destroyRef.onDestroy(unregister);
  }
}
