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
import { HlmIcon } from '@spartan-ng/helm/icon';
import { ProcessStepListComponent, type ProcessStep } from '@rabbithole/ui';
import { buildUpgradeCopy, buildUpgradeSteps } from '@rabbithole/features/storages';

import { UpdateCheckService } from '../../services';

@Component({
  selector: 'app-upgrade-dialog',
  imports: [
    NgIcon,
    HlmIcon,
    HlmBadge,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    ...HlmAlertImports,
    ...HlmButtonImports,
    ProcessStepListComponent,
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
  readonly upgradeCopy = computed(() => buildUpgradeCopy(this.updateCheckService.updateInfo() ?? {}));
  readonly isInProgress = computed(() => {
    const step = this.updateCheckService.upgradeStep();
    return step === 'preparing' || step === 'upgrading';
  });
  readonly upgradeSteps = computed<ProcessStep[]>(() => {
    const currentStep = this.updateCheckService.upgradeStep();
    const updateInfo = this.updateCheckService.updateInfo();

    if (currentStep === 'idle') {
      return [];
    }

    return buildUpgradeSteps(null, {
      completed: currentStep === 'completed',
      errorMessage:
        currentStep === 'error'
          ? (this.updateCheckService.errorMessage() ?? 'Upgrade failed')
          : null,
      failedStepId: this.updateCheckService.upgradeProcessStep(),
      frontendUpdateAvailable: updateInfo?.frontendUpdateAvailable,
      isPreparing: currentStep === 'preparing',
      wasmUpdateAvailable: updateInfo?.wasmUpdateAvailable,
    });
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
