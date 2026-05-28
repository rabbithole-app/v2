import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Principal } from '@icp-sdk/core/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideCoins,
  lucideExternalLink,
  lucideRefreshCw,
  lucideRotateCcw,
  lucideServerCog,
  lucideTrash2,
} from '@ng-icons/lucide';
import {
  BrnAlertDialogContent,
  BrnAlertDialogTrigger,
} from '@spartan-ng/brain/alert-dialog';
import { toast } from '@spartan-ng/brain/sonner';

import {
  injectMainActor,
  timeInNanosToDate,
} from '@rabbithole/core';
import {
  CmcOpKind,
  CmcOpRetryResult,
  CmcOpSource,
  PendingCmcOp,
  RefundReceipt,
  StatsView,
  TokenId,
} from '@rabbithole/declarations/backend';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

const EMPTY_STATS: StatsView = {
  totalCreated: 0n,
  totalDismissed: 0n,
  totalRefunded: 0n,
  totalResolved: 0n,
};

@Component({
  selector: 'app-admin-cmc-recovery',
  imports: [
    CopyToClipboardComponent,
    DatePipe,
    RouterLink,
    NgIcon,
    BrnAlertDialogContent,
    BrnAlertDialogTrigger,
      HlmBadge,
    HlmIcon,
    HlmSpinner,
    ...HlmAlertDialogImports,
    ...HlmButtonImports,
    ...HlmTableImports,
    ...HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideCoins,
      lucideExternalLink,
      lucideRefreshCw,
      lucideRotateCcw,
      lucideServerCog,
      lucideTrash2,
    }),
  ],
  templateUrl: './admin-cmc-recovery.component.html',
  host: {
    class: 'flex min-w-0 w-full flex-col gap-6',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCmcRecoveryComponent {
  protected readonly _actionInFlight = signal<string | null>(null);
  readonly #actor = injectMainActor();
  protected readonly _pendingOps = resource({
    params: () => this.#actor(),
    loader: ({ params }) =>
      params.listPendingCmcOps({ afterId: [], limit: [100n] }),
    defaultValue: [] as PendingCmcOp[],
  });
  protected readonly _pendingCount = computed(
    () => this._pendingOps.value().length,
  );
  protected readonly _stats = resource({
    params: () => this.#actor(),
    loader: ({ params }) => params.getCmcRecoveryStats(),
    defaultValue: EMPTY_STATS,
  });

  protected _actionDisabled(op: PendingCmcOp): boolean {
    return this._actionInFlight()?.startsWith(`${op.id}:`) ?? false;
  }

  protected _actionId(op: PendingCmcOp, action: 'dismiss' | 'retry'): string {
    return `${op.id}:${action}`;
  }

  protected _canisterText(source: CmcOpSource): string | null {
    if ('userTopUp' in source) return source.userTopUp.canisterId.toText();
    if ('autoTopUp' in source) return source.autoTopUp.canisterId.toText();
    return null;
  }

  protected _creationId(source: CmcOpSource): bigint | null {
    return 'storageCreation' in source
      ? source.storageCreation.creationId
      : null;
  }

  protected _date(value: bigint): Date {
    return timeInNanosToDate(value);
  }

  protected async _dismiss(op: PendingCmcOp): Promise<void> {
    this._actionInFlight.set(this._actionId(op, 'dismiss'));
    try {
      const result = await this.#actor().dismissPendingCmcOp(op.id);
      if ('notFound' in result) {
        toast.warning('CMC operation was not found');
        return;
      }

      toast.success('CMC operation dismissed');
      this._reload();
    } catch (error) {
      console.error('Failed to dismiss pending CMC operation', error);
      toast.error('Failed to dismiss CMC operation');
    } finally {
      this._actionInFlight.set(null);
    }
  }

  protected _kindLabel(kind: CmcOpKind): string {
    return 'CreateCanister' in kind ? 'Create canister' : 'Top up';
  }

  protected _lastAttemptDate(op: PendingCmcOp): Date | null {
    return op.lastAttemptAt.length ? this._date(op.lastAttemptAt[0]) : null;
  }

  protected _operationBadgeVariant(
    kind: CmcOpKind,
  ): 'outline' | 'secondary' {
    return 'CreateCanister' in kind ? 'outline' : 'secondary';
  }

  protected _operationIcon(kind: CmcOpKind): string {
    return 'CreateCanister' in kind ? 'lucideServerCog' : 'lucideCoins';
  }

  protected _operationTooltip(op: PendingCmcOp): string {
    const refundState = op.refund.length
      ? 'Refund payload is available.'
      : 'No refund payload is attached.';
    return `${this._kindLabel(op.kind)} via ${this._sourceLabel(op.source)}. ${refundState}`;
  }

  protected _principalText(value: Principal): string {
    return value.toText();
  }

  protected _refundAmount(op: PendingCmcOp): string {
    const refund = op.refund[0];
    if (!refund) return 'No refund payload';

    if ('ICP' in refund.tokenId) {
      return `${this._formatFixed(refund.amount, 100_000_000n, 8)} ICP`;
    }

    return `${refund.amount.toString()} ${this._tokenLabel(refund.tokenId)}`;
  }

  protected _refundPayer(op: PendingCmcOp): Principal | null {
    return op.refund[0]?.payer ?? null;
  }

  protected _reload(): void {
    this._pendingOps.reload();
    this._stats.reload();
  }

  protected async _retry(op: PendingCmcOp): Promise<void> {
    this._actionInFlight.set(this._actionId(op, 'retry'));
    try {
      const result = await this.#actor().retryPendingCmcOp(op.id);
      toast[this._retryToastLevel(result)](this._retryResultMessage(result));
      this._reload();
    } catch (error) {
      console.error('Failed to retry pending CMC operation', error);
      toast.error('Failed to retry CMC operation');
    } finally {
      this._actionInFlight.set(null);
    }
  }

  protected _sourceLabel(source: CmcOpSource): string {
    if ('storageCreation' in source) return 'Storage creation';
    if ('selfTopUp' in source) return 'Backend self top-up';
    if ('userTopUp' in source) return 'User top-up';
    return 'Auto top-up';
  }

  protected _sourceTarget(source: CmcOpSource): string {
    const creationId = this._creationId(source);
    if (creationId != null) return `Creation #${creationId.toString()}`;

    const canisterId = this._canisterText(source);
    return canisterId ?? 'Backend canister';
  }

  private _formatFixed(
    value: bigint,
    divisor: bigint,
    decimals: number,
  ): string {
    const whole = value / divisor;
    const fraction = value % divisor;
    const fractionText = fraction
      .toString()
      .padStart(divisor.toString().length - 1, '0')
      .slice(0, decimals)
      .replace(/0+$/, '');

    return fractionText ? `${whole}.${fractionText}` : whole.toString();
  }

  private _refundReference(reference: RefundReceipt['reference']): string {
    if ('blockIndex' in reference) {
      return `block ${reference.blockIndex.toString()}`;
    }
    if ('txHash' in reference) {
      return `tx ${reference.txHash}`;
    }
    return `signature ${reference.signature}`;
  }

  private _retryResultMessage(result: CmcOpRetryResult): string {
    if ('scheduled' in result) {
      return `Storage deployment scheduled for ${result.scheduled.canisterId.toText()}`;
    }
    if ('resolved' in result) return 'CMC operation resolved';
    if ('refunded' in result) {
      const receipt = result.refunded.receipt[0];
      return receipt
        ? `Refund completed: ${this._tokenLabel(receipt.tokenId)} ${this._refundReference(receipt.reference)}`
        : 'Refund completed';
    }
    if ('blockedByRefund' in result) {
      return 'Operation is blocked by refund state';
    }
    if ('notFound' in result) return 'CMC operation was not found';
    return [
      'CMC operation is still ambiguous after',
      result.stillAmbiguous.attempts.toString(),
      'attempts',
    ].join(' ');
  }

  private _retryToastLevel(
    result: CmcOpRetryResult,
  ): 'success' | 'warning' {
    if ('resolved' in result || 'refunded' in result || 'scheduled' in result) {
      return 'success';
    }
    if ('notFound' in result) return 'warning';
    return 'warning';
  }

  private _tokenLabel(tokenId: TokenId): string {
    return Object.keys(tokenId)[0] ?? 'Token';
  }
}
