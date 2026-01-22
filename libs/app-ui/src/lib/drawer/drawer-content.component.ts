import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  Renderer2,
  signal,
} from '@angular/core';
import {
  injectExposedSideProvider,
  injectExposesStateProvider,
} from '@spartan-ng/brain/core';
import { cva } from 'class-variance-authority';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

export const sheetVariants = cva(
  'size-full overflow-y-auto border-stroke-soft-200 bg-background data-[state=open]:duration-200 data-[state=open]:ease-out data-[state=open]:animate-in data-[state=closed]:duration-200 data-[state=closed]:ease-in data-[state=closed]:animate-out absolute mx-2 my-2 rounded-[1.25rem] shadow-custom-md',
  {
    variants: {
      side: {
        top: 'max-h-[400px] max-w-[calc(100%-16px)] h-[min(400px,calc(100%-16px))] border-b data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top inset-x-0 top-0',
        bottom:
          'max-h-[400px] max-w-[calc(100%-16px)] h-[min(400px,calc(100%-16px))] border-t data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom inset-x-0 bottom-0',
        left: 'max-w-[400px] max-h-[calc(100%-16px)] w-[min(400px,calc(100%-16px))] border-r data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left inset-y-0 left-0',
        right:
          'max-w-[400px] max-h-[calc(100%-16px)] w-[min(400px,calc(100%-16px))] border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right inset-y-0 right-0',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  },
);

@Component({
  selector: 'rbth-drawer-content',
  host: {
    '[class]': '_computedClass()',
    '[attr.data-state]': 'state()',
  },
  template: `
    <div class="relative flex size-full flex-col">
      <ng-content />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthDrawerContentComponent {
  private readonly _stateProvider = injectExposesStateProvider({ host: true });
  public state = this._stateProvider.state ?? signal('closed');
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  private readonly _sideProvider = injectExposedSideProvider({ host: true });
  protected _computedClass = computed(() =>
    hlm(sheetVariants({ side: this._sideProvider.side() }), this.userClass()),
  );

  private readonly _element = inject(ElementRef);

  private readonly _renderer = inject(Renderer2);
  constructor() {
    effect(() => {
      this._renderer.setAttribute(
        this._element.nativeElement,
        'data-state',
        this.state(),
      );
    });
  }
}
