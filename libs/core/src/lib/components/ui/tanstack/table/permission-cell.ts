import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { CellContext, injectFlexRenderContext } from '@tanstack/angular-table';
import { cva } from 'class-variance-authority';
import { ClassValue } from 'clsx';

import { HlmBadge } from '@spartan-ng/helm/badge';
import { hlm } from '@spartan-ng/helm/utils';

export const permissionVariants = cva('ring-1 ring-inset', {
  variants: {
    permission: {
      Controller: 'bg-purple-50 text-purple-700 ring-purple-200',
      ReadWriteManage: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
      ReadWrite: 'bg-green-50 text-green-700 ring-green-200',
      Read: 'bg-gray-50 text-gray-700 ring-gray-200',
    },
  },
});

@Component({
  template: `<span hlmBadge [class]="_computedClass()">{{
    context.getValue()
  }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '_computedClass()',
  },
  imports: [HlmBadge],
})
export class PermissionCell<T> {
  readonly context = injectFlexRenderContext<CellContext<T, unknown>>();
  permission = input(
    this.context.getValue<
      'Controller' | 'Read' | 'ReadWrite' | 'ReadWriteManage'
    >(),
  );
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected _computedClass = computed(() =>
    hlm(
      permissionVariants({
        permission: this.permission(),
      }),
      this.userClass(),
    ),
  );
}
