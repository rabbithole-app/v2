import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleX,
} from '@ng-icons/lucide';

import { CopyToClipboardComponent } from '@rabbithole/core';
import type { StorageCreationStatus } from '@rabbithole/core';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmProgressImports } from '@spartan-ng/helm/progress';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

type ProgressMode = 'create' | 'upgrade';

interface StageInfo {
  canisterId?: string;
  description: string;
  progress?: number;
  stage: UserStage;
  title: string;
}

/**
 * Simplified user-facing stages for storage creation and upgrade
 */
type UserStage =
  | 'completed'
  | 'creating-canister'
  | 'failed'
  | 'finalizing'
  | 'installing-wasm'
  | 'upgrading-frontend'
  | 'upgrading-wasm'
  | 'uploading-frontend';

@Component({
  selector: 'rbth-feat-storages-creation-progress',
  imports: [
    NgIcon,
    HlmSpinner,
    CopyToClipboardComponent,
    ...HlmEmptyImports,
    ...HlmProgressImports,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideCircleX,
    }),
  ],
  templateUrl: './storage-creation-progress.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorageCreationProgressComponent {
  readonly mode = input<ProgressMode>('create');

  readonly stages = computed<UserStage[]>(() => {
    if (this.mode() === 'upgrade') {
      return ['upgrading-wasm', 'upgrading-frontend', 'finalizing'];
    }
    return ['creating-canister', 'installing-wasm', 'uploading-frontend', 'finalizing'];
  });

  readonly status = input.required<StorageCreationStatus>();

  readonly currentStageIndex = computed(() => {
    const stage = this.#getUserStage(this.status());
    const index = this.stages().indexOf(stage);
    return index >= 0 ? index : 0;
  });

  readonly stageInfo = computed<StageInfo>(() => {
    const status = this.status();
    const stage = this.#getUserStage(status);

    switch (stage) {
      case 'completed':
        return {
          stage,
          title: 'Storage Ready',
          description: 'Your encrypted storage is ready to use!',
          canisterId: status.type === 'Completed' ? status.canisterId.toText() : undefined,
        };

      case 'creating-canister':
        return {
          stage,
          title: 'Creating Canister',
          description: 'Setting up your storage canister on the Internet Computer...',
        };

      case 'failed':
        return {
          stage,
          title: 'Setup Failed',
          description: status.type === 'Failed' ? status.message : 'An error occurred',
        };

      case 'finalizing':
        return {
          stage,
          title: 'Finalizing',
          description: 'Completing the setup and configuring permissions...',
        };

      case 'installing-wasm':
        return {
          stage,
          title: 'Installing Storage Module',
          description: 'Deploying the encrypted storage module to your canister...',
          progress: this.#getProgress(status),
        };

      case 'upgrading-frontend':
        return {
          stage,
          title: 'Upgrading Interface',
          description: 'Uploading updated interface assets...',
          progress: this.#getProgress(status),
        };

      case 'upgrading-wasm':
        return {
          stage,
          title: 'Upgrading Storage Module',
          description: 'Installing the updated storage module...',
          progress: this.#getProgress(status),
        };

      case 'uploading-frontend':
        return {
          stage,
          title: 'Setting Up Interface',
          description: 'Uploading the user interface assets...',
          progress: this.#getProgress(status),
        };
    }
  });

  #getProgress(status: StorageCreationStatus): number | undefined {
    if (
      status.type === 'InstallingWasm' ||
      status.type === 'UploadingFrontend' ||
      status.type === 'UpgradingWasm' ||
      status.type === 'UpgradingFrontend'
    ) {
      const { processed, total } = status.progress;
      if (total > 0) {
        return Math.round((processed * 100) / total);
      }
      return 0;
    }
    return undefined;
  }

  #getUserStage(status: StorageCreationStatus): UserStage {
    switch (status.type) {
      case 'CanisterCreated':
      case 'CheckingAllowance':
      case 'NotifyingCMC':
      case 'Pending':
      case 'TransferringICP':
        return 'creating-canister';

      case 'Completed':
        return 'completed';

      case 'Failed':
        return 'failed';

      case 'InstallingWasm':
        return 'installing-wasm';

      case 'RevokingInstallerPermission':
      case 'UpdatingControllers':
        return 'finalizing';

      case 'UpgradingFrontend':
        return 'upgrading-frontend';

      case 'UpgradingWasm':
        return 'upgrading-wasm';

      case 'UploadingFrontend':
        return 'uploading-frontend';

      default:
        return 'creating-canister';
    }
  }
}
