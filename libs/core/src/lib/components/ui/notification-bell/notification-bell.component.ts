import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAlertCircle,
  lucideAlertTriangle,
  lucideArrowDownCircle,
  lucideBatteryLow,
  lucideBell,
  lucideCheckCircle,
  lucideCircleDollarSign,
  lucideClipboardList,
  lucideDownload,
  lucideKeyRound,
  lucideMail,
  lucideRefreshCw,
  lucideShieldCheck,
  lucideSparkles,
  lucideWallet,
  lucideXCircle,
} from '@ng-icons/lucide';
import { BrnSheetContent, BrnSheetTrigger } from '@spartan-ng/brain/sheet';

import type { NotificationPayload } from '@rabbithole/declarations/backend';
import type { StorageEvent } from '@rabbithole/declarations/encrypted-storage';
import {
  RbthDrawerComponent,
  RbthDrawerContentComponent,
  RbthDrawerFooterComponent,
  RbthDrawerHeaderComponent,
  RbthDrawerTitleDirective,
} from '@rabbithole/ui/drawer';
import { HlmAvatarBadge } from '@spartan-ng/helm/avatar';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';

import { AggregatedNotification, NotificationService } from '../../../services';
import { formatTCycles } from '../../../utils/cycles';
import { formatICP } from '../../../utils/format-icp';

type NotificationFilter = 'all' | 'backend' | 'storage' | 'unread';

@Component({
  selector: 'core-notification-bell',
  imports: [
    HlmBadge,
    HlmAvatarBadge,
    HlmButton,
    HlmIcon,
    NgIcon,
    BrnSheetContent,
    BrnSheetTrigger,
    RbthDrawerComponent,
    RbthDrawerContentComponent,
    RbthDrawerFooterComponent,
    RbthDrawerHeaderComponent,
    RbthDrawerTitleDirective,
    ...HlmEmptyImports,
    ...HlmItemImports,
    ...HlmTabsImports,
  ],
  providers: [
    provideIcons({
      lucideAlertCircle,
      lucideAlertTriangle,
      lucideArrowDownCircle,
      lucideBatteryLow,
      lucideBell,
      lucideCheckCircle,
      lucideCircleDollarSign,
      lucideClipboardList,
      lucideDownload,
      lucideKeyRound,
      lucideMail,
      lucideRefreshCw,
      lucideShieldCheck,
      lucideSparkles,
      lucideWallet,
      lucideXCircle,
    }),
  ],
  templateUrl: './notification-bell.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationBellComponent {
  readonly #notificationService = inject(NotificationService);
  readonly unreadCount = this.#notificationService.unreadCount;
  readonly badgeText = computed(() => {
    const count = this.unreadCount();
    return count > 9n ? '9+' : count.toString();
  });

  readonly filter = signal<NotificationFilter>('all');
  readonly items = this.#notificationService.items;
  readonly filteredItems = computed(() => {
    const filter = this.filter();
    return this.items().filter((item) => {
      if (filter === 'unread') return !item.read;
      if (filter === 'backend')
        return (
          item.source === 'backend' &&
          !this.#isBackendStorageEvent(item.raw.payload)
        );
      if (filter === 'storage') return this.#isStorageNotification(item);
      return true;
    });
  });
  readonly hasUnread = computed(() => this.unreadCount() > 0n);
  readonly isLoading = this.#notificationService.isLoading;
  readonly #router = inject(Router);
  private readonly drawer = viewChild(RbthDrawerComponent);

  formatTime(ns: bigint): string {
    const ms = Number(ns) / 1_000_000;
    const diff = Date.now() - ms;
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
    return new Date(ms).toLocaleDateString();
  }

  itemDescription(item: AggregatedNotification): string {
    return item.source === 'backend'
      ? this.#backendDescription(item.raw.payload)
      : this.#storageDescription(item.raw.event);
  }

  itemIcon(item: AggregatedNotification): string {
    return item.source === 'backend'
      ? this.#backendIcon(item.raw.payload)
      : this.#storageIcon(item.raw.event);
  }

  itemIconClass(item: AggregatedNotification): string {
    return item.source === 'backend'
      ? this.#backendIconClass(item.raw.payload)
      : this.#storageIconClass(item.raw.event);
  }

  itemSourceLabel(item: AggregatedNotification): string {
    return this.#isStorageNotification(item) ? 'Storage' : 'Backend';
  }

  itemTitle(item: AggregatedNotification): string {
    return item.source === 'backend'
      ? this.#backendTitle(item.raw.payload)
      : this.#storageTitle(item.raw.event);
  }

  markAllAsRead(): void {
    void this.#notificationService.markAllAsRead();
  }

  onDrawerStateChanged(state: 'closed' | 'open'): void {
    if (state === 'open') {
      void this.#notificationService.loadNotifications(50n);
    }
  }

  async openNotification(item: AggregatedNotification): Promise<void> {
    await this.#notificationService.markItemAsRead(item);

    const url = this.#notificationUrl(item);
    if (url) {
      this.drawer()?.close();
      await this.#router.navigateByUrl(url);
    }
  }

  #accessClassLabel(value: unknown): string {
    if (this.#hasKey(value, 'ownerEquivalent')) return 'recovery access';
    if (this.#hasKey(value, 'durable')) return 'durable access';
    return 'standard access';
  }

  #accessSourceLabel(value: unknown): string {
    if (this.#hasKey(value, 'accessRequest')) return 'access request';
    if (this.#hasKey(value, 'ordinaryInvite')) return 'invite';
    if (this.#hasKey(value, 'durablePolicy')) return 'durable policy';
    if (this.#hasKey(value, 'recoverySetup')) return 'recovery setup';
    return 'direct grant';
  }

  #backendDescription(event: NotificationPayload): string {
    if ('subscriptionActivated' in event) {
      const plan = Object.keys(event.subscriptionActivated.plan)[0];
      return `${plan} plan`;
    }
    if ('paymentReceived' in event)
      return `${event.paymentReceived.amount} ${event.paymentReceived.tokenId}`;
    if ('depositReceived' in event)
      return `${event.depositReceived.amount} ${event.depositReceived.tokenId}`;
    if ('autoRenewFailed' in event) return event.autoRenewFailed.reason;
    if ('lowCycles' in event)
      return `${event.lowCycles.canisterId.toText()} has ~${event.lowCycles.estimatedDaysLeft} days left`;
    if ('topUpCompleted' in event)
      return `${event.topUpCompleted.canisterId.toText()} received ${this.#formatCycles(
        event.topUpCompleted.cyclesAmount,
      )}`;
    if ('topUpFailed' in event) return event.topUpFailed.reason;
    if ('autoTopUpCompleted' in event)
      return `${event.autoTopUpCompleted.canisterId.toText()} received ${this.#formatCycles(
        event.autoTopUpCompleted.cyclesAmount,
      )}`;
    if ('autoTopUpFailed' in event) return event.autoTopUpFailed.reason;
    if ('updateAvailable' in event)
      return `${event.updateAvailable.canisterId.toText()} can update to ${event.updateAvailable.releaseTag}`;
    if ('balanceLow' in event)
      return `Required amount: ${event.balanceLow.requiredAmount}`;
    if ('backendLowCycles' in event)
      return `Backend cycles ${this.#formatCycles(
        event.backendLowCycles.current,
      )} / threshold ${this.#formatCycles(event.backendLowCycles.threshold)}`;
    if ('creationRefunded' in event)
      return `Refunded ${event.creationRefunded.amount} ${event.creationRefunded.tokenId}`;
    if ('backendSelfTopUpFailed' in event)
      return event.backendSelfTopUpFailed.reason;
    if ('ambassadorPayoutFailed' in event)
      return event.ambassadorPayoutFailed.reason;
    if ('cmcNotifyStuck' in event)
      return `CMC notify #${event.cmcNotifyStuck.id.toString()} failed: ${event.cmcNotifyStuck.reason}`;
    if ('treasuryIcpLow' in event)
      return `Balance ${this.#formatIcpE8s(
        event.treasuryIcpLow.currentBalance,
      )} / required ${this.#formatIcpE8s(
        event.treasuryIcpLow.required,
      )} + reserve ${this.#formatIcpE8s(event.treasuryIcpLow.reserve)}`;
    if ('storageAccessRequestCreated' in event)
      return `${event.storageAccessRequestCreated.requester.toText()} requested access`;
    if ('storageAccessRequestResolved' in event)
      return `Request #${event.storageAccessRequestResolved.requestId.toString()} was ${this.#statusLabel(event.storageAccessRequestResolved.status)}`;
    if ('storageAccessRequestCancelled' in event)
      return `${event.storageAccessRequestCancelled.requester.toText()} cancelled request #${event.storageAccessRequestCancelled.requestId.toString()}`;
    if ('storageInviteCreated' in event)
      return `Invite #${event.storageInviteCreated.grantId.toString()} for ${this.#accessClassLabel(event.storageInviteCreated.accessClass)}`;
    if ('storageInviteClaimed' in event)
      return `${event.storageInviteClaimed.principal.toText()} claimed invite #${event.storageInviteClaimed.grantId.toString()}`;
    if ('storageInviteCancelled' in event)
      return `Invite #${event.storageInviteCancelled.grantId.toString()} was cancelled`;
    if ('storageAccessGranted' in event)
      return `${this.#accessClassLabel(event.storageAccessGranted.accessClass)} from ${this.#accessSourceLabel(event.storageAccessGranted.source)}`;
    if ('storageAccessRevoked' in event) return 'Your storage access changed';
    if ('storageRecoveryOwnerAdded' in event)
      return `Recovery owner access added for ${event.storageRecoveryOwnerAdded.canisterId.toText()}`;
    if ('storageRecoveryOwnerRemoved' in event)
      return `Recovery owner access removed for ${event.storageRecoveryOwnerRemoved.canisterId.toText()}`;
    return '';
  }

  #backendIcon(event: NotificationPayload): string {
    if ('subscriptionActivated' in event) return 'lucideCheckCircle';
    if ('subscriptionExpired' in event) return 'lucideAlertTriangle';
    if ('subscriptionRenewed' in event) return 'lucideRefreshCw';
    if ('paymentReceived' in event) return 'lucideCircleDollarSign';
    if ('depositReceived' in event) return 'lucideArrowDownCircle';
    if ('autoRenewFailed' in event) return 'lucideAlertCircle';
    if ('lowCycles' in event) return 'lucideBatteryLow';
    if ('topUpCompleted' in event) return 'lucideCheckCircle';
    if ('topUpFailed' in event) return 'lucideXCircle';
    if ('autoTopUpCompleted' in event) return 'lucideCheckCircle';
    if ('autoTopUpFailed' in event) return 'lucideXCircle';
    if ('updateAvailable' in event) return 'lucideDownload';
    if ('balanceLow' in event) return 'lucideWallet';
    if ('backendLowCycles' in event) return 'lucideBatteryLow';
    if ('creationRefunded' in event) return 'lucideCircleDollarSign';
    if ('backendSelfTopUpFailed' in event) return 'lucideXCircle';
    if ('ambassadorPayoutFailed' in event) return 'lucideXCircle';
    if ('cmcNotifyStuck' in event) return 'lucideAlertCircle';
    if ('treasuryIcpLow' in event) return 'lucideWallet';
    if ('storageAccessRequestCreated' in event) return 'lucideClipboardList';
    if ('storageAccessRequestResolved' in event) return 'lucideCheckCircle';
    if ('storageAccessRequestCancelled' in event) return 'lucideXCircle';
    if ('storageInviteCreated' in event) return 'lucideMail';
    if ('storageInviteClaimed' in event) return 'lucideCheckCircle';
    if ('storageInviteCancelled' in event) return 'lucideXCircle';
    if ('storageAccessGranted' in event) return 'lucideShieldCheck';
    if ('storageAccessRevoked' in event) return 'lucideXCircle';
    if ('storageRecoveryOwnerAdded' in event) return 'lucideKeyRound';
    if ('storageRecoveryOwnerRemoved' in event) return 'lucideKeyRound';
    return 'lucideBell';
  }

  #backendIconClass(event: NotificationPayload): string {
    if (
      'subscriptionActivated' in event ||
      'subscriptionRenewed' in event ||
      'topUpCompleted' in event ||
      'autoTopUpCompleted' in event ||
      'storageAccessRequestResolved' in event ||
      'storageInviteClaimed' in event ||
      'storageAccessGranted' in event ||
      'creationRefunded' in event
    )
      return 'text-green-600';
    if (
      'subscriptionExpired' in event ||
      'lowCycles' in event ||
      'balanceLow' in event ||
      'backendLowCycles' in event ||
      'treasuryIcpLow' in event ||
      'storageAccessRequestCreated' in event ||
      'storageInviteCreated' in event
    )
      return 'text-amber-600';
    if (
      'autoRenewFailed' in event ||
      'topUpFailed' in event ||
      'autoTopUpFailed' in event ||
      'backendSelfTopUpFailed' in event ||
      'ambassadorPayoutFailed' in event ||
      'cmcNotifyStuck' in event ||
      'storageAccessRequestCancelled' in event ||
      'storageInviteCancelled' in event ||
      'storageAccessRevoked' in event
    )
      return 'text-red-600';
    return 'text-muted-foreground';
  }

  #backendTitle(event: NotificationPayload): string {
    if ('subscriptionActivated' in event) return 'Subscription activated';
    if ('subscriptionExpired' in event) return 'Subscription expired';
    if ('subscriptionRenewed' in event) return 'Subscription renewed';
    if ('paymentReceived' in event) return 'Payment received';
    if ('depositReceived' in event) return 'Deposit received';
    if ('autoRenewFailed' in event) return 'Auto-renew failed';
    if ('lowCycles' in event) return 'Low cycles warning';
    if ('topUpCompleted' in event) return 'Top-up completed';
    if ('topUpFailed' in event) return 'Top-up failed';
    if ('autoTopUpCompleted' in event) return 'Auto top-up completed';
    if ('autoTopUpFailed' in event) return 'Auto top-up failed';
    if ('updateAvailable' in event) return 'Update available';
    if ('balanceLow' in event) return 'Balance running low';
    if ('backendLowCycles' in event) return 'Backend cycles low';
    if ('creationRefunded' in event) return 'Storage creation refunded';
    if ('backendSelfTopUpFailed' in event) return 'Backend top-up failed';
    if ('ambassadorPayoutFailed' in event) return 'Ambassador payout failed';
    if ('cmcNotifyStuck' in event) return 'CMC notification stuck';
    if ('treasuryIcpLow' in event) return 'Treasury ICP low';
    if ('storageAccessRequestCreated' in event) return 'Access request';
    if ('storageAccessRequestResolved' in event)
      return 'Access request resolved';
    if ('storageAccessRequestCancelled' in event)
      return 'Access request cancelled';
    if ('storageInviteCreated' in event) return 'Storage invite';
    if ('storageInviteClaimed' in event) return 'Storage invite claimed';
    if ('storageInviteCancelled' in event) return 'Storage invite cancelled';
    if ('storageAccessGranted' in event) return 'Access granted';
    if ('storageAccessRevoked' in event) return 'Access revoked';
    if ('storageRecoveryOwnerAdded' in event) return 'Recovery owner added';
    if ('storageRecoveryOwnerRemoved' in event) return 'Recovery owner removed';
    return 'Notification';
  }

  #formatCycles(cycles: bigint): string {
    return `${formatTCycles(cycles)} TCycles`;
  }

  #formatIcpE8s(e8s: bigint): string {
    return `${formatICP(e8s)} ICP`;
  }

  #hasKey(value: unknown, key: string): boolean {
    return !!value && typeof value === 'object' && key in value;
  }

  #isBackendStorageEvent(event: NotificationPayload): boolean {
    return (
      'storageAccessRequestCreated' in event ||
      'storageAccessRequestResolved' in event ||
      'storageAccessRequestCancelled' in event ||
      'storageInviteCreated' in event ||
      'storageInviteClaimed' in event ||
      'storageInviteCancelled' in event ||
      'storageAccessGranted' in event ||
      'storageAccessRevoked' in event ||
      'storageRecoveryOwnerAdded' in event ||
      'storageRecoveryOwnerRemoved' in event
    );
  }

  #isStorageNotification(item: AggregatedNotification): boolean {
    return (
      item.source === 'storage' ||
      (item.source === 'backend' &&
        this.#isBackendStorageEvent(item.raw.payload))
    );
  }

  #notificationUrl(item: AggregatedNotification): string | null {
    if (item.source === 'storage') {
      return this.#storageUrl(item.storageCanisterId.toText(), item.raw.event);
    }

    const event = item.raw.payload;
    if ('storageAccessRequestCreated' in event) {
      return `/dashboard/${event.storageAccessRequestCreated.canisterId.toText()}/access-requests/${event.storageAccessRequestCreated.requestId.toString()}`;
    }
    if ('storageAccessRequestCancelled' in event) {
      return `/dashboard/${event.storageAccessRequestCancelled.canisterId.toText()}/access-requests`;
    }
    if ('storageAccessRequestResolved' in event) {
      return `/dashboard/${event.storageAccessRequestResolved.canisterId.toText()}/drive`;
    }
    if ('storageInviteCreated' in event || 'storageAccessGranted' in event) {
      return '/dashboard/shared-with-me';
    }
    if ('storageInviteClaimed' in event) {
      return `/dashboard/${event.storageInviteClaimed.canisterId.toText()}/drive`;
    }
    if ('storageAccessRevoked' in event) {
      return `/dashboard/${event.storageAccessRevoked.canisterId.toText()}/drive`;
    }
    if ('storageRecoveryOwnerAdded' in event) {
      return `/dashboard/${event.storageRecoveryOwnerAdded.canisterId.toText()}/drive`;
    }
    if ('storageRecoveryOwnerRemoved' in event) {
      return `/dashboard/${event.storageRecoveryOwnerRemoved.canisterId.toText()}/drive`;
    }
    if ('updateAvailable' in event) {
      return `/dashboard/${event.updateAvailable.canisterId.toText()}/drive`;
    }
    if ('lowCycles' in event) {
      return `/dashboard/${event.lowCycles.canisterId.toText()}/drive`;
    }
    return null;
  }

  #statusLabel(value: unknown): string {
    if (this.#hasKey(value, 'approved')) return 'approved';
    if (this.#hasKey(value, 'rejected')) return 'rejected';
    if (this.#hasKey(value, 'cancelled')) return 'cancelled';
    return 'pending';
  }

  #storageDescription(event: StorageEvent): string {
    const access = event.access;
    if ('accessRequestCreated' in access)
      return `${access.accessRequestCreated.requester.toText()} requested access`;
    if ('accessRequestResolved' in access)
      return `Request #${access.accessRequestResolved.requestId.toString()} was ${this.#statusLabel(access.accessRequestResolved.status)}`;
    if ('accessRequestCancelled' in access)
      return `${access.accessRequestCancelled.requester.toText()} cancelled request #${access.accessRequestCancelled.requestId.toString()}`;
    if ('pendingGrantCreated' in access)
      return `Invite #${access.pendingGrantCreated.grantId.toString()} for ${this.#accessClassLabel(access.pendingGrantCreated.accessClass)}`;
    if ('pendingGrantClaimed' in access)
      return `${access.pendingGrantClaimed.principal.toText()} claimed invite #${access.pendingGrantClaimed.grantId.toString()}`;
    if ('pendingGrantCancelled' in access)
      return `Invite #${access.pendingGrantCancelled.grantId.toString()} was cancelled`;
    if ('principalGrantCreated' in access)
      return `${access.principalGrantCreated.principal.toText()} received ${this.#accessClassLabel(access.principalGrantCreated.accessClass)}`;
    if ('principalGrantRevoked' in access)
      return `${access.principalGrantRevoked.principal.toText()} access was revoked`;
    if ('recoveryControllerRegistered' in access)
      return `${access.recoveryControllerRegistered.principal.toText()} registered recovery control`;
    if ('recoveryControllerCleared' in access)
      return `${access.recoveryControllerCleared.principal.toText()} cleared recovery control`;
    if ('recoveryOwnerAdded' in access)
      return `${access.recoveryOwnerAdded.principal.toText()} became recovery owner`;
    if ('recoveryOwnerRemoved' in access)
      return `${access.recoveryOwnerRemoved.principal.toText()} recovery owner access removed`;
    return '';
  }

  #storageIcon(event: StorageEvent): string {
    const access = event.access;
    if ('accessRequestCreated' in access) return 'lucideClipboardList';
    if ('accessRequestResolved' in access) return 'lucideCheckCircle';
    if ('accessRequestCancelled' in access) return 'lucideXCircle';
    if ('pendingGrantCreated' in access) return 'lucideMail';
    if ('pendingGrantClaimed' in access) return 'lucideCheckCircle';
    if ('pendingGrantCancelled' in access) return 'lucideXCircle';
    if ('principalGrantCreated' in access) return 'lucideShieldCheck';
    if ('principalGrantRevoked' in access) return 'lucideXCircle';
    if ('recoveryControllerRegistered' in access) return 'lucideKeyRound';
    if ('recoveryControllerCleared' in access) return 'lucideKeyRound';
    if ('recoveryOwnerAdded' in access) return 'lucideKeyRound';
    if ('recoveryOwnerRemoved' in access) return 'lucideKeyRound';
    return 'lucideBell';
  }

  #storageIconClass(event: StorageEvent): string {
    const access = event.access;
    if (
      'accessRequestResolved' in access ||
      'pendingGrantClaimed' in access ||
      'principalGrantCreated' in access ||
      'recoveryOwnerAdded' in access
    )
      return 'text-green-600';
    if ('accessRequestCreated' in access || 'pendingGrantCreated' in access)
      return 'text-amber-600';
    if (
      'accessRequestCancelled' in access ||
      'pendingGrantCancelled' in access ||
      'principalGrantRevoked' in access ||
      'recoveryOwnerRemoved' in access
    )
      return 'text-red-600';
    return 'text-muted-foreground';
  }

  #storageTitle(event: StorageEvent): string {
    const access = event.access;
    if ('accessRequestCreated' in access) return 'Access request';
    if ('accessRequestResolved' in access) return 'Access request resolved';
    if ('accessRequestCancelled' in access) return 'Access request cancelled';
    if ('pendingGrantCreated' in access) return 'Storage invite';
    if ('pendingGrantClaimed' in access) return 'Storage invite claimed';
    if ('pendingGrantCancelled' in access) return 'Storage invite cancelled';
    if ('principalGrantCreated' in access) return 'Access granted';
    if ('principalGrantRevoked' in access) return 'Access revoked';
    if ('recoveryControllerRegistered' in access)
      return 'Recovery controller registered';
    if ('recoveryControllerCleared' in access)
      return 'Recovery controller cleared';
    if ('recoveryOwnerAdded' in access) return 'Recovery owner added';
    if ('recoveryOwnerRemoved' in access) return 'Recovery owner removed';
    return 'Storage event';
  }

  #storageUrl(canisterId: string, event: StorageEvent): string {
    const access = event.access;
    if ('accessRequestCreated' in access) {
      return `/dashboard/${canisterId}/access-requests/${access.accessRequestCreated.requestId.toString()}`;
    }
    if ('accessRequestCancelled' in access) {
      return `/dashboard/${canisterId}/access-requests`;
    }
    return `/dashboard/${canisterId}/drive`;
  }
}
