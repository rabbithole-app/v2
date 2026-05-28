import { formatBytes } from '@rabbithole/core';
import type {
  PaymentPhase,
  StorageCreationStatus,
  TokenId,
} from '@rabbithole/core';
import type { ProcessStep } from '@rabbithole/ui/process-steps';

/**
 * Storage-creation wizard steps for `rbth-process-steps`. The ID order
 * mirrors the real execution order on the backend, so `pickStepStatus`
 * below can mark everything before the current step as `completed` and
 * everything after as `pending`.
 */
const STEP_DEFS = [
  { id: 'payment', title: 'Payment' },
  { id: 'canister', title: 'Create canister' },
  { id: 'wasm', title: 'Install storage module' },
  { id: 'frontend', title: 'Set up interface' },
  { id: 'finalize', title: 'Finalize' },
] as const;

type StepId = (typeof STEP_DEFS)[number]['id'];

function paymentPhaseLabel(phase: PaymentPhase): string {
  switch (phase.type) {
    case 'Charging':
      return `Charging ${formatTokenAmount(phase.amount, phase.tokenId)}`;
    case 'CheckingBalances':
      return 'Checking your balances';
    case 'FetchingRates':
      return 'Fetching exchange rates';
    case 'Queueing':
      return 'Queuing deployment';
    case 'RecordingLicense':
      return 'Recording license';
    case 'Starting':
      return 'Preparing transaction';
  }
}

/**
 * Which step is active for a given `StorageCreationStatus`. `#Failed` is
 * considered active at the step where it happened, which we derive by looking
 * at the record's `canisterId` — null means we never got past Payment/Canister,
 * non-null means the failure was during install/finalize.
 */
function stepForStatus(
  status: StorageCreationStatus,
  hasCanisterId: boolean,
): StepId {
  switch (status.type) {
    case 'CanisterCreated':
    case 'CheckingBalance':
    case 'NotifyingCMC':
    case 'Pending':
    case 'TransferringICP':
      return 'canister';
    case 'Completed':
      return 'finalize'; // completed = last step marked done
    case 'Failed':
      return hasCanisterId ? 'wasm' : 'payment';
    case 'InstallingWasm':
    case 'ReinstallingWasm':
    case 'UpgradingWasm':
      return 'wasm';
    case 'ProcessingPayment':
      return 'payment';
    case 'RevokingInstallerPermission':
    case 'UpdatingControllers':
      return 'finalize';
    case 'UpgradingFrontend':
    case 'UploadingFrontend':
      return 'frontend';
  }
}

const TOKEN_DECIMALS: Record<TokenId, number> = {
  ICP: 8,
  ckUSDC: 6,
  ckUSDT: 6,
  ckETH: 18,
  BaseETH: 18,
  BaseUSDC: 6,
  BaseUSDT: 6,
  SOL: 9,
  SolUSDC: 6,
  SolUSDT: 6,
};

/** Build the 5-step list the `rbth-process-steps` component renders. */
export function buildCreationSteps(
  status: StorageCreationStatus | null,
  hasCanisterId: boolean,
  canisterIdText?: string,
): ProcessStep[] {
  const activeId: StepId = status
    ? stepForStatus(status, hasCanisterId)
    : 'payment';
  const isFailed = status?.type === 'Failed';
  const isCompleted = status?.type === 'Completed';
  const desc = status ? statusDescription(status) : undefined;

  return STEP_DEFS.map(({ id, title }, index) => {
    const activeIndex = STEP_DEFS.findIndex((s) => s.id === activeId);

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

    if (id === activeId && stepStatus === 'in-progress' && desc) {
      step.description = desc;
    }
    if (id === activeId && stepStatus === 'error' && desc) {
      step.error = desc;
    }

    // Expose canister id under the "Create canister" step once we have it.
    if (id === 'canister' && canisterIdText) {
      step.meta = canisterIdText;
      step.metaLabel = 'Canister ID';
    }

    // Attach numeric progress for wasm/frontend steps when available.
    // WASM step counts chunks; frontend step measures bytes — format each
    // appropriately so the label under the progress bar is human-friendly.
    if (
      (id === 'wasm' || id === 'frontend') &&
      status &&
      (status.type === 'InstallingWasm' ||
        status.type === 'ReinstallingWasm' ||
        status.type === 'UpgradingWasm' ||
        status.type === 'UploadingFrontend' ||
        status.type === 'UpgradingFrontend')
    ) {
      const isWasm =
        status.type === 'InstallingWasm' ||
        status.type === 'ReinstallingWasm' ||
        status.type === 'UpgradingWasm';
      const belongs = (id === 'wasm' && isWasm) || (id === 'frontend' && !isWasm);
      if (belongs) {
        const { processed, total } = status.progress;
        step.progress = {
          current: processed,
          total,
          label: isWasm
            ? `${processed} / ${total} chunks`
            : `${formatBytes(processed)} / ${formatBytes(total)}`,
        };
      }
    }

    return step;
  });
}

function formatTokenAmount(amount: bigint, tokenId: TokenId): string {
  const decimals = TOKEN_DECIMALS[tokenId];
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  // Show up to 6 fraction digits, stripping trailing zeros.
  const fracStr = fraction.toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr} ${tokenId}` : `${whole} ${tokenId}`;
}

/**
 * Human-readable description shown in the "in-progress" step. Progress
 * counts (chunks / bytes) are NOT duplicated here — they live under the
 * progress bar via `progress.label`.
 */
function statusDescription(status: StorageCreationStatus): string {
  switch (status.type) {
    case 'CanisterCreated':
      return 'Canister created — starting module install';
    case 'CheckingBalance':
      return 'Checking backend ICP balance';
    case 'Completed':
      return 'Storage is ready!';
    case 'Failed':
      return status.message;
    case 'InstallingWasm':
    case 'ReinstallingWasm':
    case 'UpgradingWasm':
      return 'Uploading storage module';
    case 'NotifyingCMC':
      return 'Asking the cycle minter to create the canister';
    case 'Pending':
      return 'Waiting in the deploy queue';
    case 'ProcessingPayment':
      return paymentPhaseLabel(status.phase);
    case 'RevokingInstallerPermission':
      return 'Removing installer permissions';
    case 'TransferringICP':
      return 'Sending ICP to the cycle minter';
    case 'UpdatingControllers':
      return 'Handing over controllership to you';
    case 'UpgradingFrontend':
    case 'UploadingFrontend':
      return 'Uploading frontend assets';
  }
}

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

export type UpgradeStepId = (typeof UPGRADE_STEP_DEFS)[number]['id'];

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
  const activeIndex = foundActiveIndex >= 0 ? foundActiveIndex : included.length - 1;
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
