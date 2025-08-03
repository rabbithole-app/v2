import { Directive } from '@angular/core';
import {
  BrnTooltipTrigger,
  provideBrnTooltipDefaultOptions,
} from '@spartan-ng/brain/tooltip';

const DEFAULT_TOOLTIP_CONTENT_CLASSES =
  'bg-primary text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance';

@Directive({
  selector: '[rbthTooltipTrigger]',
  standalone: true,
  providers: [
    provideBrnTooltipDefaultOptions({
      showDelay: 100,
      hideDelay: 0,
      exitAnimationDuration: 150,
      tooltipContentClasses: DEFAULT_TOOLTIP_CONTENT_CLASSES,
    }),
  ],
  hostDirectives: [
    {
      directive: BrnTooltipTrigger,
      inputs: [
        'brnTooltipDisabled: rbthTooltipDisabled',
        'brnTooltipTrigger: rbthTooltipTrigger',
        'aria-describedby',
        'position',
        'positionAtOrigin',
        'hideDelay',
        'showDelay',
        'exitAnimationDuration',
        'touchGestures',
      ],
    },
  ],
})
export class RbthTooltipTriggerDirective {}
