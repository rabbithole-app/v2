import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  contentChild,
  Directive,
  inject,
  input,
  TemplateRef,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideAtSign, lucideKeyRound, lucideUserRound } from '@ng-icons/lucide';

import { HlmAvatarImports } from '@spartan-ng/helm/avatar';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItem, HlmItemImports } from '@spartan-ng/helm/item';

@Directive({
  selector: 'ng-template[coreAccessTargetItemActions]',
})
export class AccessTargetItemActionsDirective {
  readonly templateRef = inject<TemplateRef<unknown>>(TemplateRef);
}

@Directive({
  selector: 'ng-template[coreAccessTargetItemDescription]',
})
export class AccessTargetItemDescriptionDirective {
  readonly templateRef = inject<TemplateRef<unknown>>(TemplateRef);
}

@Directive({
  selector: 'ng-template[coreAccessTargetItemTitle]',
})
export class AccessTargetItemTitleDirective {
  readonly templateRef = inject<TemplateRef<unknown>>(TemplateRef);
}

@Component({
  selector: 'core-access-target-item',
  imports: [
    HlmAvatarImports,
    HlmIcon,
    HlmItemImports,
    NgIcon,
    NgTemplateOutlet,
  ],
  providers: [
    provideIcons({
      lucideAtSign,
      lucideKeyRound,
      lucideUserRound,
    }),
  ],
  hostDirectives: [
    {
      directive: HlmItem,
      inputs: ['variant', 'size'],
    },
  ],
  host: {
    class:
      'flex-nowrap [&>[data-slot=item-actions]]:ml-auto [&>[data-slot=item-actions]]:shrink-0 [&>[data-slot=item-actions]]:flex-nowrap [&>[data-slot=item-content]]:min-w-0',
  },
  templateUrl: "./access-target-item.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessTargetItemComponent {
  readonly actionsTemplate = contentChild(AccessTargetItemActionsDirective);
  readonly avatarSrc = input<string | undefined>();
  readonly description = input<string | undefined>();
  readonly descriptionTemplate = contentChild(AccessTargetItemDescriptionDirective);

  readonly iconName = input('lucideUserRound');
  readonly title = input.required<string>();
  readonly titleTemplate = contentChild(AccessTargetItemTitleDirective);
}
