import { Directive, TemplateRef, inject, input } from '@angular/core';

import { RbthCustomFilterModel } from './types';

export interface RbthFilterValueContext {
  $implicit: RbthCustomFilterModel;
  filter: RbthCustomFilterModel;
  multiple: boolean;
  setValue: (value: unknown | null | undefined) => void;
  setValues: (values: ReadonlyArray<unknown> | null | undefined) => void;
  value: unknown | null;
  values: ReadonlyArray<unknown>;
}

@Directive({
  selector: 'ng-template[rbthFilterValue]',
})
export class RbthFilterValueDirective {
  readonly columnId = input.required<string>({ alias: 'rbthFilterValue' });
  readonly templateRef =
    inject<TemplateRef<RbthFilterValueContext>>(TemplateRef);
}
