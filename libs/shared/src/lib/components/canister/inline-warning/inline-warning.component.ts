import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideAlertTriangle } from '@ng-icons/lucide';
import { HlmIcon } from '@spartan-ng/helm/icon';

@Component({
  selector: 'shared-inline-warning',
  imports: [NgIcon, HlmIcon],
  providers: [provideIcons({ lucideAlertTriangle })],
  template: `
    <ng-icon
      hlm
      name="lucideAlertTriangle"
      [attr.size]="iconSize()"
      class="text-amber-500"
      [attr.title]="title() || undefined"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InlineWarningComponent {
  /** Icon size */
  iconSize = input<number>(16);

  /** Warning title/tooltip */
  title = input<string | undefined>();
}
