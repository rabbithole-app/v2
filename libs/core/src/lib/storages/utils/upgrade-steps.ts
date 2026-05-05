import type { ProcessStep } from '@rabbithole/ui/process-steps';

import { formatBytes } from '../../utils/format-bytes';
import type { StorageCreationStatus } from '../types/storage.types';

const UPGRADE_STEP_DEFS = [
  { id: 'permissions', title: 'Grant permissions' },
  { id: 'wasm', title: 'Upgrade storage module' },
  { id: 'frontend', title: 'Update interface' },
  { id: 'finalize', title: 'Finalize' },
] as const;

export interface BuildUpgradeStepsOptions {
  completed?: boolean;
  errorMessage?: string | null;
  failedStepId?: UpgradeStepId | null;
  frontendUpdateAvailable?: boolean;
  isPreparing?: boolean;
  wasmUpdateAvailable?: boolean;
}

export type UpgradeCopy = {
  completedDescription: string;
  progressDescription: string;
};

export type UpgradeCopyInput = {
  frontendUpdateAvailable?: boolean | null;
  wasmUpdateAvailable?: boolean | null;
};

export type UpgradeStepId = (typeof UPGRADE_STEP_DEFS)[number]['id'];

export function buildUpgradeCopy(input: UpgradeCopyInput): UpgradeCopy {
  const hasWasm = input.wasmUpdateAvailable === true;
  const hasFrontend = input.frontendUpdateAvailable === true;

  if (hasWasm && hasFrontend) {
    return {
      completedDescription:
        'The storage module and interface updates completed successfully.',
      progressDescription:
        'Track permissions, module install, interface upload, and controller cleanup.',
    };
  }

  if (hasWasm) {
    return {
      completedDescription: 'The storage module update completed successfully.',
      progressDescription:
        'Track permissions, module install, and controller cleanup.',
    };
  }

  if (hasFrontend) {
    return {
      completedDescription: 'The interface update completed successfully.',
      progressDescription:
        'Track permissions, interface upload, and controller cleanup.',
    };
  }

  return {
    completedDescription: 'The available updates completed successfully.',
    progressDescription: 'Track permissions, update progress, and controller cleanup.',
  };
}

export function buildUpgradeSteps(
  status: StorageCreationStatus | null,
  options: BuildUpgradeStepsOptions = {},
): ProcessStep[] {
  const included = UPGRADE_STEP_DEFS.filter((step) => {
    if (step.id === 'wasm') return options.wasmUpdateAvailable ?? true;
    if (step.id === 'frontend') return options.frontendUpdateAvailable ?? true;
    return true;
  });

  const activeId = upgradeStepForStatus(status, options);
  const foundActiveIndex = included.findIndex((step) => step.id === activeId);
  const activeIndex =
    foundActiveIndex >= 0 ? foundActiveIndex : included.length - 1;
  const isCompleted = options.completed || status?.type === 'Completed';
  const isFailed = status?.type === 'Failed' || !!options.errorMessage;
  const description = status
    ? upgradeStatusDescription(status)
    : options.isPreparing
      ? 'Adding the backend as controller and granting commit access'
      : 'Installing the available update';

  return included.map(({ id, title }, index) => {
    let stepStatus: ProcessStep['status'];
    if (isCompleted) {
      stepStatus = 'completed';
    } else if (isFailed && id === activeId) {
      stepStatus = 'error';
    } else if (index < activeIndex) {
      stepStatus = 'completed';
    } else if (index === activeIndex) {
      stepStatus = 'in-progress';
    } else {
      stepStatus = 'pending';
    }

    const step: ProcessStep = { id, title, status: stepStatus };

    if (id === activeId && stepStatus === 'in-progress' && description) {
      step.description = description;
    }
    if (
      (id === 'wasm' || id === 'frontend') &&
      status &&
      (status.type === 'UpgradingWasm' || status.type === 'UpgradingFrontend')
    ) {
      const belongs =
        (id === 'wasm' && status.type === 'UpgradingWasm') ||
        (id === 'frontend' && status.type === 'UpgradingFrontend');

      if (belongs) {
        const { processed, total } = status.progress;
        step.progress = {
          current: processed,
          total,
          label:
            status.type === 'UpgradingWasm'
              ? `${processed} / ${total} chunks`
              : `${formatBytes(processed)} / ${formatBytes(total)}`,
        };
      }
    }

    return step;
  });
}

function upgradeStatusDescription(status: StorageCreationStatus): string {
  switch (status.type) {
    case 'Completed':
      return 'Storage is up to date';
    case 'Failed':
      return status.message;
    case 'RevokingInstallerPermission':
      return 'Removing temporary backend permissions';
    case 'UpdatingControllers':
      return 'Restoring storage controllers';
    case 'UpgradingFrontend':
      return 'Uploading updated frontend assets';
    case 'UpgradingWasm':
      return 'Installing the updated storage module';
    default:
      return 'Waiting for the upgrade to start';
  }
}

function upgradeStepForStatus(
  status: StorageCreationStatus | null,
  options: BuildUpgradeStepsOptions,
): UpgradeStepId {
  if (options.isPreparing) return 'permissions';
  if (options.errorMessage && options.failedStepId) return options.failedStepId;

  switch (status?.type) {
    case 'Completed':
    case 'RevokingInstallerPermission':
    case 'UpdatingControllers':
      return 'finalize';
    case 'Failed':
      return options.failedStepId ?? 'finalize';
    case 'UpgradingFrontend':
      return 'frontend';
    case 'UpgradingWasm':
      return 'wasm';
    default:
      if (options.wasmUpdateAvailable) return 'wasm';
      if (options.frontendUpdateAvailable) return 'frontend';
      return 'finalize';
  }
}
