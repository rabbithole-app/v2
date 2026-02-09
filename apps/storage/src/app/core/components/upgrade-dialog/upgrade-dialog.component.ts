import { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowUpCircle,
  lucideCheck,
  lucideCircleAlert,
  lucideGlobe,
  lucidePackage,
} from '@ng-icons/lucide';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import { UpdateCheckService } from '../../services';

@Component({
  selector: 'app-upgrade-dialog',
  imports: [
    NgIcon,
    HlmIcon,
    HlmBadge,
    HlmSpinner,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    ...HlmAlertImports,
    ...HlmButtonImports,
    ...HlmEmptyImports,
  ],
  providers: [
    provideIcons({
      lucideArrowUpCircle,
      lucideCheck,
      lucideCircleAlert,
      lucideGlobe,
      lucidePackage,
    }),
  ],
  templateUrl: './upgrade-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpgradeDialogComponent {
  readonly updateCheckService = inject(UpdateCheckService);
  readonly isInProgress = computed(() => {
    const step = this.updateCheckService.upgradeStep();
    return step === 'preparing' || step === 'upgrading';
  });
  readonly #dialogRef = inject(DialogRef);

  closeDialog(): void {
    this.#dialogRef.close();
  }

  startUpgrade(): void {
    this.updateCheckService.startUpgrade();
  }

  tryAgain(): void {
    this.updateCheckService.reset();
  }
}
