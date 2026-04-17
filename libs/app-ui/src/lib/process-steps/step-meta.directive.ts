import { Directive, inject, TemplateRef } from '@angular/core';

import type { ProcessStepTemplateContext } from './process-step.types';

@Directive({
  selector: 'ng-template[rbthStepMeta]',
})
export class RbthStepMetaDirective {
  readonly templateRef =
    inject<TemplateRef<ProcessStepTemplateContext>>(TemplateRef);
}
