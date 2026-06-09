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
} from '@ng-icons/lucide';

import {
  buildUpgradeCopy,
  buildUpgradeSteps,
  StorageUpgradeReviewComponent,
} from '@rabbithole/core/storage-runtime';
import { type ProcessStep, ProcessStepListComponent } from '@rabbithole/ui/process-steps';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';

import { UpdateCheckService } from '../../services';

@Component({
  selector: 'app-upgrade-dialog',
  imports: [
    NgIcon,
    HlmIcon,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    ...HlmAlertImports,
    ...HlmButtonImports,
    ProcessStepListComponent,
    StorageUpgradeReviewComponent,
  ],
  providers: [
    provideIcons({
      lucideArrowUpCircle,
      lucideCheck,
      lucideCircleAlert,
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
  readonly upgradeCopy = computed(() => buildUpgradeCopy(this.updateCheckService.selectedUpdateInfo() ?? {}));
  readonly upgradeSteps = computed<ProcessStep[]>(() => {
    const currentStep = this.updateCheckService.upgradeStep();
    const updateInfo = this.updateCheckService.selectedUpdateInfo();

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

  selectRelease(releaseTag: string | null): void {
    this.updateCheckService.selectReleaseTag(releaseTag);
  }

  startUpgrade(): void {
    this.updateCheckService.startUpgrade();
  }

  tryAgain(): void {
    this.updateCheckService.reset();
  }
}
