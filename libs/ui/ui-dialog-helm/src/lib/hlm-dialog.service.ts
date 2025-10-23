import type { ComponentType } from '@angular/cdk/portal';
import { inject, Injectable, type TemplateRef } from '@angular/core';
import {
  type BrnDialogOptions,
  BrnDialogService,
  cssClassesToArray,
  DEFAULT_BRN_DIALOG_OPTIONS,
} from '@spartan-ng/brain/dialog';

import { HlmDialogContent } from './hlm-dialog-content';
import { hlmDialogOverlayClass } from './hlm-dialog-overlay';

export type HlmDialogOptions<DialogContext = unknown> = {
  contentClass?: string;
  context?: DialogContext;
} & BrnDialogOptions;

@Injectable({
  providedIn: 'root',
})
export class HlmDialogService {
  private readonly _brnDialogService = inject(BrnDialogService);

  public open(
    component: ComponentType<unknown> | TemplateRef<unknown>,
    options?: Partial<HlmDialogOptions>,
  ) {
    const mergedOptions = {
      ...DEFAULT_BRN_DIALOG_OPTIONS,

      ...(options ?? {}),
      backdropClass: cssClassesToArray(
        `${hlmDialogOverlayClass} ${options?.backdropClass ?? ''}`,
      ),
      context: {
        ...(options?.context && typeof options.context === 'object'
          ? options.context
          : {}),
        $component: component,
        $dynamicComponentClass: options?.contentClass,
      },
    };

    return this._brnDialogService.open(
      HlmDialogContent,
      undefined,
      mergedOptions.context,
      mergedOptions,
    );
  }
}
