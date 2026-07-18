import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { Principal } from '@icp-sdk/core/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideChevronDown,
  lucideCircleDashed,
  lucideX,
} from '@ng-icons/lucide';
import { BrnDialogState } from '@spartan-ng/brain/dialog';
import { BrnPopoverImports } from '@spartan-ng/brain/popover';

import {
  formatBytes,
  formatTokenAmountInput,
  injectMainActor,
  timeInNanosToDate,
} from '@rabbithole/core';
import { TOKEN_CONFIGS } from '@rabbithole/core/wallet';
import {
  CreationListItem,
  CreationStatus,
  FrontendInstallDiagnostics,
  PaymentPhase,
  Progress,
  StatusEvent,
  StorageCreationRecord,
  TokenId,
} from '@rabbithole/declarations/backend';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCollapsibleImports } from '@spartan-ng/helm/collapsible';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmPopoverImports } from '@spartan-ng/helm/popover';
import { HlmProgressImports } from '@spartan-ng/helm/progress';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';

type DeploymentStep = {
  details: DeploymentStepDetail[];
  id: DeploymentStepId;
  progress: Progress | null;
  state: StepState;
  title: string;
};
type DeploymentStepDetail = { label: string; value: string };
type DeploymentStepId =
  | 'canister'
  | 'finalize'
  | 'frontend'
  | 'payment'
  | 'permissions'
  | 'wasm';
type StatusPopoverTab = 'deployment' | 'events';
type StepState = 'active' | 'completed' | 'failed' | 'pending';

@Component({
  selector: 'app-admin-creation-status-popover',
  imports: [
    CopyToClipboardComponent,
    DatePipe,
    BrnPopoverImports,
      HlmBadge,
    HlmIcon,
    HlmSpinner,
    NgIcon,
    ...HlmButtonImports,
    ...HlmCollapsibleImports,
    ...HlmPopoverImports,
    ...HlmProgressImports,
    ...HlmTabsImports,
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideCircleDashed,
      lucideX,
      lucideCheck,
    }),
  ],
  templateUrl: './admin-creation-status-popover.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block min-w-0 max-w-full',
  },
})
export class AdminCreationStatusPopoverComponent {
  readonly creation = input.required<CreationListItem>();
  readonly refreshRequested = output<void>();

  protected readonly _activeTab = signal<StatusPopoverTab>('deployment');
  protected readonly _detail = signal<StorageCreationRecord | null>(null);
  protected readonly _detailError = signal<string | null>(null);
  protected readonly _detailLoading = signal(false);
  protected readonly _frontendDiagnosticsExpanded = signal(false);
  protected readonly _popoverState = signal<BrnDialogState>('closed');

  readonly #actor = injectMainActor();
  #detailCreationId: string | null = null;

  constructor() {
    effect(() => {
      if (this._popoverState() !== 'open') return;

      void this._loadDetail(false);
    });

    effect((onCleanup) => {
      if (this._popoverState() !== 'open') return;
      if (!this._isActive(this.creation())) return;

      const intervalId = window.setInterval(() => {
        this.refreshRequested.emit();
        void this._loadDetail(true);
      }, 3_000);

      onCleanup(() => window.clearInterval(intervalId));
    });

    effect(() => {
      const creationId = this.creation().id.toString();
      if (creationId === this.#detailCreationId) return;
      this.#detailCreationId = null;
      this._detail.set(null);
      this._detailError.set(null);
    });
  }

  protected _badgeVariant(
    value: string,
  ): 'default' | 'destructive' | 'outline' | 'secondary' {
    if (value === 'Failed' || value === 'failed') return 'destructive';
    if (value === 'Completed' || value === 'completed') return 'default';
    if (value === 'skipped') return 'outline';
    return 'secondary';
  }

  protected _date(value: bigint): Date {
    return timeInNanosToDate(value);
  }

  protected _deploymentSteps(record: CreationListItem): DeploymentStep[] {
    const defs = record.isUpgrade
      ? this._upgradeStepDefs(record)
      : this._creationStepDefs();
    const activeId = record.isUpgrade
      ? this._upgradeStepId(record)
      : this._creationStepId(record);
    const activeIndex = defs.findIndex((step) => step.id === activeId);
    const isCompleted = record.statusTag === 'Completed';
    const isFailed = record.statusTag === 'Failed';

    return defs.map((def, index) => {
      const state = this._stepState({
        activeIndex,
        index,
        isCompleted,
        isFailed,
      });

      return {
        ...def,
        details: this._stepDetails(def.id, record),
        progress: this._stepProgress(def.id, record),
        state,
      };
    });
  }

  protected _eventKey(status: CreationStatus): string {
    if ('ProcessingPayment' in status) {
      return `payment.${this._paymentPhaseKey(status.ProcessingPayment)}`;
    }
    if ('Pending' in status) return 'deploy.queued';
    if ('CheckingBalance' in status) return 'treasury.check';
    if ('TransferringICP' in status) return 'cmc.transfer';
    if ('NotifyingCMC' in status) return 'cmc.notify';
    if ('CanisterCreated' in status) return 'canister.created';
    if ('InstallingWasm' in status) return 'wasm.install';
    if ('ReinstallingWasm' in status) return 'wasm.reinstall';
    if ('UploadingFrontend' in status) return 'frontend.upload';
    if ('RevokingInstallerPermission' in status) return 'permissions.revoke';
    if ('UpdatingControllers' in status) return 'controllers.update';
    if ('UpgradingWasm' in status) return 'wasm.upgrade';
    if ('UpgradingFrontend' in status) return 'frontend.upgrade';
    if ('Completed' in status) return 'deploy.completed';
    if ('Failed' in status) return 'deploy.failed';
    return 'deploy.status';
  }

  protected _eventMessage(status: CreationStatus): string {
    return this._statusDescriptionFromStatus(status);
  }

  protected _eventProgressRange(status: CreationStatus, progress: Progress): string {
    return 'UploadingFrontend' in status || 'UpgradingFrontend' in status
      ? this._formatByteProgress(progress)
      : this._rawProgress(progress);
  }

  protected _events(): StatusEvent[] {
    return this._detail()?.events ?? [];
  }

  protected _frontendDiagnosticRows(
    diagnostics: FrontendInstallDiagnostics,
  ): DeploymentStepDetail[] {
    const rows: DeploymentStepDetail[] = [
      { label: 'stage', value: diagnostics.stage },
      {
        label: 'files',
        value: `${diagnostics.processedFiles.toString()} / ${diagnostics.totalFiles.toString()}`,
      },
      {
        label: 'bytes',
        value: `${this._formatBytes(diagnostics.processedBytes)} / ${this._formatBytes(diagnostics.totalBytes)}`,
      },
      {
        label: 'uploaded',
        value: `${diagnostics.uploadedFiles.toString()} files, ${this._formatBytes(diagnostics.uploadedBytes)}`,
      },
      {
        label: 'skipped',
        value: `${diagnostics.skippedFiles.toString()} files, ${this._formatBytes(diagnostics.skippedBytes)}`,
      },
      {
        label: 'deleted',
        value: `${diagnostics.staleDeletedFiles.toString()} stale, ${diagnostics.changedDeletedFiles.toString()} changed`,
      },
      {
        label: 'batches',
        value: `${diagnostics.batchesProcessed.toString()} / ${diagnostics.batchesTotal.toString()}`,
      },
      {
        label: 'updated',
        value: this._date(diagnostics.updatedAt).toLocaleString(),
      },
    ];

    if (diagnostics.completedAt[0]) {
      rows.push({
        label: 'completed',
        value: this._date(diagnostics.completedAt[0]).toLocaleString(),
      });
    }
    if (diagnostics.error[0]) {
      rows.push({ label: 'error', value: diagnostics.error[0] });
    }

    return rows;
  }

  protected _frontendDiagnostics(): FrontendInstallDiagnostics | null {
    return this._detail()?.frontendInstallDiagnostics[0] ?? null;
  }

  protected _hasVisibleProgress(progress: Progress): boolean {
    return progress.total > 0n;
  }

  protected _isBadgeDetail(detail: DeploymentStepDetail): boolean {
    return detail.label === 'release' || detail.label === 'installed';
  }

  protected _isCopyDetail(detail: DeploymentStepDetail): boolean {
    return (
      detail.label === 'canister' ||
      detail.label === 'license' ||
      detail.label === 'subnet'
    );
  }

  protected _openEventsTab(): void {
    this._activeTab.set('events');
    void this._loadDetail(false);
  }

  protected _operationLabel(record: CreationListItem): string {
    return record.isUpgrade ? 'Upgrade' : 'Creation';
  }

  protected _principalText(value: [] | [Principal]): string {
    return value[0]?.toText() ?? '';
  }

  protected _progressFromStatus(status: CreationStatus): Progress | null {
    return 'InstallingWasm' in status
      ? status.InstallingWasm.progress
      : 'ReinstallingWasm' in status
        ? status.ReinstallingWasm.progress
        : 'UploadingFrontend' in status
          ? status.UploadingFrontend.progress
          : 'UpgradingWasm' in status
            ? status.UpgradingWasm.progress
            : 'UpgradingFrontend' in status
              ? status.UpgradingFrontend.progress
              : null;
  }

  protected _progressPercent(progress: Progress): number {
    const total = Number(progress.total);

    if (total <= 0) return 0;

    return Math.min(
      100,
      Math.round((Number(progress.processed) / total) * 100),
    );
  }

  protected _progressRange(stepId: DeploymentStepId, progress: Progress): string {
    return stepId === 'frontend'
      ? this._formatByteProgress(progress)
      : this._rawProgress(progress);
  }

  protected _setPopoverState(state: BrnDialogState): void {
    this._popoverState.set(state);
    if (state === 'closed') {
      this._activeTab.set('deployment');
    }
  }

  protected _shortPrincipal(principalId: string): string {
    return principalId.length > 20
      ? `${principalId.slice(0, 8)}...${principalId.slice(-7)}`
      : principalId;
  }

  protected _statusDescription(record: CreationListItem): string {
    return this._statusDescriptionFromStatus(record.status);
  }

  protected _statusDescriptionFromStatus(status: CreationStatus): string {
    if ('Failed' in status) return status.Failed;
    if ('ProcessingPayment' in status) {
      return this._paymentPhaseLabel(status.ProcessingPayment);
    }
    if ('TransferringICP' in status) {
      return this._formatIcpE8s(status.TransferringICP.amount);
    }
    if ('NotifyingCMC' in status) {
      return `block ${status.NotifyingCMC.blockIndex.toString()}`;
    }
    if (this._hasProgress(status)) {
      return this._progressLabel(status);
    }
    if ('CanisterCreated' in status) {
      return status.CanisterCreated.canisterId.toText();
    }
    if ('RevokingInstallerPermission' in status) {
      return status.RevokingInstallerPermission.canisterId.toText();
    }
    if ('UpdatingControllers' in status) {
      return status.UpdatingControllers.canisterId.toText();
    }
    if ('Completed' in status) {
      return status.Completed.canisterId.toText();
    }
    return this._statusTitle(status);
  }

  protected _statusLabel(statusTag: string): string {
    if (statusTag.startsWith('ProcessingPayment.')) {
      return statusTag.replace('ProcessingPayment.', 'Payment: ');
    }
    return statusTag.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  protected _triggerDescription(record: CreationListItem): string {
    if ('Pending' in record.status) return 'waiting for deployer';

    return this._statusDescription(record);
  }

  protected _triggerLabel(record: CreationListItem): string {
    return this._statusLabel(record.statusTag).replace('Wasm', 'WASM');
  }

  protected _triggerState(record: CreationListItem): StepState {
    if (record.statusTag === 'Completed') return 'completed';
    if (record.statusTag === 'Failed') return 'failed';
    if ('Pending' in record.status) return 'pending';
    return 'active';
  }

  private _canisterDetail(record: CreationListItem): DeploymentStepDetail[] {
    const details: DeploymentStepDetail[] = [];
    const canisterId = this._principalText(record.canisterId);
    const subnetId = this._principalText(record.subnetId);
    const cmcTransfer = this._cmcTransfer(record);

    if (canisterId) details.push({ label: 'canister', value: canisterId });
    if (subnetId) details.push({ label: 'subnet', value: subnetId });
    if (cmcTransfer) details.push({ label: 'cmc transfer', value: cmcTransfer });

    return details;
  }

  private _cmcTransfer(record: CreationListItem): string | null {
    if ('TransferringICP' in record.status) {
      return this._formatIcpE8s(record.status.TransferringICP.amount);
    }

    const event = this._latestEvent((status) => 'TransferringICP' in status);

    return event && 'TransferringICP' in event.status
      ? this._formatIcpE8s(event.status.TransferringICP.amount)
      : null;
  }

  private _creationStepDefs(): Array<{
    id: DeploymentStepId;
    title: string;
  }> {
    return [
      { id: 'payment', title: 'Payment' },
      { id: 'canister', title: 'Canister' },
      { id: 'wasm', title: 'WASM' },
      { id: 'frontend', title: 'Frontend' },
      { id: 'finalize', title: 'Finalize' },
    ];
  }

  private _creationStepId(record: CreationListItem): DeploymentStepId {
    const status = record.status;
    if ('ProcessingPayment' in status) return 'payment';
    if (
      'Pending' in status ||
      'CheckingBalance' in status ||
      'TransferringICP' in status ||
      'NotifyingCMC' in status ||
      'CanisterCreated' in status
    ) {
      return 'canister';
    }
    if (
      'InstallingWasm' in status ||
      'ReinstallingWasm' in status ||
      'UpgradingWasm' in status
    ) {
      return 'wasm';
    }
    if ('UploadingFrontend' in status || 'UpgradingFrontend' in status) {
      return 'frontend';
    }
    if ('RevokingInstallerPermission' in status || 'UpdatingControllers' in status) {
      return 'finalize';
    }
    if ('Completed' in status) return 'finalize';
    if ('Failed' in status) return record.canisterId[0] ? 'wasm' : 'payment';
    return 'payment';
  }

  private _eventProgressFor(stepId: DeploymentStepId): Progress | null {
    const event = this._latestEvent((status) => {
      if (stepId === 'wasm') {
        return (
          'InstallingWasm' in status ||
          'ReinstallingWasm' in status ||
          'UpgradingWasm' in status
        );
      }
      if (stepId === 'frontend') {
        return 'UploadingFrontend' in status || 'UpgradingFrontend' in status;
      }
      return false;
    });

    return event ? this._progressFromStatus(event.status) : null;
  }

  private _finalizeDetail(record: CreationListItem): DeploymentStepDetail[] {
    const details: DeploymentStepDetail[] = [];

    if (record.completedAt[0]) {
      details.push({
        label: 'completed',
        value: this._date(record.completedAt[0]).toLocaleString(),
      });
    }
    if (record.lastEventAt[0]) {
      details.push({
        label: 'last event',
        value: this._date(record.lastEventAt[0]).toLocaleString(),
      });
    }

    return details;
  }

  private _formatByteProgress(progress: Progress): string {
    return `${this._formatBytes(progress.processed)} / ${this._formatBytes(progress.total)}`;
  }

  private _formatBytes(value: bigint): string {
    return formatBytes(Number(value));
  }

  private _formatIcpE8s(e8s: bigint): string {
    const whole = e8s / 100_000_000n;
    const fraction = (e8s % 100_000_000n)
      .toString()
      .padStart(8, '0')
      .replace(/0+$/, '');

    return fraction
      ? `${whole.toString()}.${fraction} ICP`
      : `${whole.toString()} ICP`;
  }

  private _formatTokenAmount(amount: bigint, tokenId: TokenId): string {
    const label = this._tokenLabel(tokenId);
    const decimals = TOKEN_CONFIGS.find(
      (config) => label in config.tokenId,
    )?.decimals;
    if (decimals === undefined) return `${amount.toString()} ${label}`;

    return `${formatTokenAmountInput(amount, decimals)} ${label}`;
  }

  private _hasProgress(status: CreationStatus): boolean {
    return (
      'InstallingWasm' in status ||
      'ReinstallingWasm' in status ||
      'UploadingFrontend' in status ||
      'UpgradingWasm' in status ||
      'UpgradingFrontend' in status
    );
  }

  private _isActive(record: CreationListItem): boolean {
    return record.statusTag !== 'Completed' && record.statusTag !== 'Failed';
  }

  private _latestEvent(
    predicate: (status: CreationStatus) => boolean,
  ): StatusEvent | null {
    const events = this._events();

    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (predicate(event.status)) return event;
    }

    return null;
  }

  private async _loadDetail(force: boolean): Promise<void> {
    const creationId = this.creation().id.toString();
    if (!force && this.#detailCreationId === creationId && this._detail()) return;
    if (this._detailLoading()) return;

    this._detailLoading.set(true);
    this._detailError.set(null);
    try {
      const detail = await this.#actor().getCreationDetail(this.creation().id);
      this.#detailCreationId = creationId;
      this._detail.set(detail[0] ?? null);
    } catch (error) {
      console.error('Failed to load creation events', error);
      this._detailError.set('Failed to load events');
    } finally {
      this._detailLoading.set(false);
    }
  }

  private _optionalDate(value: [] | [bigint]): Date | null {
    return value[0] ? this._date(value[0]) : null;
  }

  private _paymentCharge(record: CreationListItem): string | null {
    if ('ProcessingPayment' in record.status && 'Charging' in record.status.ProcessingPayment) {
      return this._formatTokenAmount(
        record.status.ProcessingPayment.Charging.amount,
        record.status.ProcessingPayment.Charging.tokenId,
      );
    }

    const event = this._latestEvent(
      (status) => 'ProcessingPayment' in status && 'Charging' in status.ProcessingPayment,
    );

    return event &&
      'ProcessingPayment' in event.status &&
      'Charging' in event.status.ProcessingPayment
      ? this._formatTokenAmount(
          event.status.ProcessingPayment.Charging.amount,
          event.status.ProcessingPayment.Charging.tokenId,
        )
      : null;
  }

  private _paymentDetail(record: CreationListItem): DeploymentStepDetail[] {
    const details: DeploymentStepDetail[] = [];
    const charge = this._paymentCharge(record);
    const licensePaymentId = record.licensePaymentId[0];

    if (charge) details.push({ label: 'charged', value: charge });
    if (licensePaymentId) {
      details.push({ label: 'license', value: licensePaymentId });
    }
    if ('ProcessingPayment' in record.status) {
      details.push({
        label: 'phase',
        value: this._paymentPhaseLabel(record.status.ProcessingPayment),
      });
    }

    return details;
  }

  private _paymentPhaseKey(phase: PaymentPhase): string {
    if ('Charging' in phase) return 'charging';
    if ('CheckingBalances' in phase) return 'checking';
    if ('FetchingRates' in phase) return 'rates';
    if ('Queueing' in phase) return 'queueing';
    if ('RecordingLicense' in phase) return 'license';
    if ('Starting' in phase) return 'starting';
    return 'processing';
  }

  private _paymentPhaseLabel(phase: PaymentPhase): string {
    if ('Charging' in phase) {
      return `Charging ${this._formatTokenAmount(phase.Charging.amount, phase.Charging.tokenId)}`;
    }
    if ('CheckingBalances' in phase) return 'Checking balances';
    if ('FetchingRates' in phase) return 'Fetching exchange rates';
    if ('Queueing' in phase) return 'Queueing deployment';
    if ('RecordingLicense' in phase) return 'Recording license';
    if ('Starting' in phase) return 'Preparing transaction';
    return 'Processing payment';
  }

  private _progressDetail(
    stepId: DeploymentStepId,
    record: CreationListItem,
  ): DeploymentStepDetail[] {
    const details: DeploymentStepDetail[] = [];
    const progress = this._stepProgress(stepId, record);

    if (progress && this._hasVisibleProgress(progress)) {
      details.push({
        label: 'progress',
        value: this._progressRange(stepId, progress),
      });
    }
    if (stepId === 'wasm') {
      details.push({ label: 'release', value: record.releaseTag });
      if (record.installedReleaseTag[0]) {
        details.push({
          label: 'installed',
          value: record.installedReleaseTag[0],
        });
      }
    }

    return details;
  }

  private _progressLabel(status: CreationStatus): string {
    const progress = this._progressFromStatus(status);

    if (!progress) return '';
    return this._eventProgressRange(status, progress);
  }

  private _rawProgress(progress: Progress): string {
    return `${progress.processed.toString()} / ${progress.total.toString()}`;
  }

  private _statusTitle(status: CreationStatus): string {
    if ('ProcessingPayment' in status) {
      return this._paymentPhaseLabel(status.ProcessingPayment);
    }
    if ('Pending' in status) return 'Queued';
    if ('CheckingBalance' in status) return 'Checking treasury balance';
    if ('TransferringICP' in status) return 'Transferring ICP to CMC';
    if ('NotifyingCMC' in status) return 'Creating canister via CMC';
    if ('CanisterCreated' in status) return 'Canister created';
    if ('InstallingWasm' in status) return 'Installing storage WASM';
    if ('ReinstallingWasm' in status) return 'Reinstalling storage WASM';
    if ('UploadingFrontend' in status) return 'Uploading frontend assets';
    if ('RevokingInstallerPermission' in status) {
      return 'Revoking installer permission';
    }
    if ('UpdatingControllers' in status) return 'Updating controllers';
    if ('UpgradingWasm' in status) return 'Upgrading storage WASM';
    if ('UpgradingFrontend' in status) return 'Upgrading frontend assets';
    if ('Completed' in status) return 'Completed';
    if ('Failed' in status) return 'Failed';
    return 'Unknown';
  }

  private _stepDetails(
    stepId: DeploymentStepId,
    record: CreationListItem,
  ): DeploymentStepDetail[] {
    if (stepId === 'payment') return this._paymentDetail(record);
    if (stepId === 'canister') return this._canisterDetail(record);
    if (stepId === 'wasm' || stepId === 'frontend') {
      return this._progressDetail(stepId, record);
    }
    if (stepId === 'finalize') return this._finalizeDetail(record);
    if (stepId === 'permissions') return this._canisterDetail(record);

    return [];
  }

  private _stepProgress(
    stepId: DeploymentStepId,
    record: CreationListItem,
  ): Progress | null {
    const currentProgress = this._progressFromStatus(record.status);

    if (
      currentProgress &&
      ((stepId === 'wasm' &&
        ('InstallingWasm' in record.status ||
          'ReinstallingWasm' in record.status ||
          'UpgradingWasm' in record.status)) ||
        (stepId === 'frontend' &&
          ('UploadingFrontend' in record.status ||
            'UpgradingFrontend' in record.status)))
    ) {
      return currentProgress;
    }

    return this._eventProgressFor(stepId);
  }

  private _stepState(args: {
    activeIndex: number;
    index: number;
    isCompleted: boolean;
    isFailed: boolean;
  }): StepState {
    if (args.isCompleted) return 'completed';
    if (args.isFailed && args.index === args.activeIndex) return 'failed';
    if (args.index < args.activeIndex) return 'completed';
    if (args.index === args.activeIndex) return 'active';
    return 'pending';
  }

  private _tokenLabel(tokenId: TokenId): string {
    return Object.keys(tokenId)[0] ?? 'token';
  }

  private _upgradeStepDefs(record: CreationListItem): Array<{
    id: DeploymentStepId;
    title: string;
  }> {
    return [
      { id: 'permissions', title: 'Permissions' },
      { id: 'wasm', title: 'WASM' },
      ...(record.upgradeIncludesFrontend
        ? [{ id: 'frontend' as const, title: 'Frontend' }]
        : []),
      { id: 'finalize', title: 'Finalize' },
    ];
  }

  private _upgradeStepId(record: CreationListItem): DeploymentStepId {
    const status = record.status;
    if ('UpgradingWasm' in status) return 'wasm';
    if ('UpgradingFrontend' in status) return 'frontend';
    if ('RevokingInstallerPermission' in status || 'UpdatingControllers' in status) {
      return 'finalize';
    }
    if ('Completed' in status) return 'finalize';
    if ('Failed' in status) return record.canisterId[0] ? 'wasm' : 'permissions';
    return 'permissions';
  }
}
