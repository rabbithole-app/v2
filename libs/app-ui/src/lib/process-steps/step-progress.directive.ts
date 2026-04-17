import { Directive, inject, TemplateRef } from '@angular/core';

import type { ProcessStepTemplateContext } from './process-step.types';

@Directive({
  selector: 'ng-template[rbthStepProgress]',
})
export class RbthStepProgressDirective {
  readonly templateRef =
    inject<TemplateRef<ProcessStepTemplateContext>>(TemplateRef);
}
