import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideAlertCircle,
  lucideAlertTriangle,
  lucideArrowDownCircle,
  lucideBatteryLow,
  lucideBell,
  lucideCheckCircle,
  lucideCircleDollarSign,
  lucideDownload,
  lucideRefreshCw,
  lucideSparkles,
  lucideWallet,
  lucideXCircle,
} from '@ng-icons/lucide';
import { BrnPopoverImports } from '@spartan-ng/brain/popover';

import type { StoredNotification, TypedEvent } from '@rabbithole/declarations/backend';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmPopoverImports } from '@spartan-ng/helm/popover';
import { HlmSeparator } from '@spartan-ng/helm/separator';

import { NotificationService } from '../../../services';

@Component({
  selector: 'core-notification-bell',
  imports: [
    ...BrnPopoverImports,
    ...HlmPopoverImports,
    HlmButton,
    HlmIcon,
    HlmSeparator,
    NgIcon,
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
      lucideDownload,
      lucideRefreshCw,
      lucideSparkles,
      lucideWallet,
      lucideXCircle,
    }),
  ],
  template: `
    <button
      hlmBtn
      variant="ghost"
      size="icon"
      class="relative"
      brnPopoverTrigger
      (click)="onBellClick()"
    >
      <ng-icon name="lucideBell" hlmIcon size="sm" />
      @if (hasUnread()) {
        <span class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
          {{ badgeText() }}
        </span>
      }
    </button>

    <div hlmPopoverContent *brnPopoverContent="let ctx" class="w-80 p-0">
        <div class="flex items-center justify-between px-4 py-3">
          <h3 class="text-sm font-semibold">Notifications</h3>
          @if (hasUnread()) {
            <button hlmBtn variant="ghost" size="sm" (click)="markAllAsRead()">
              Mark all read
            </button>
          }
        </div>
        <hlm-separator />
        <div class="max-h-80 overflow-y-auto">
          @if (notifications().length === 0) {
            <p class="px-4 py-6 text-center text-sm text-muted-foreground">
              No notifications yet
            </p>
          } @else {
            @for (notification of notifications(); track notification.id) {
              <button
                type="button"
                class="flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                [class.opacity-60]="notification.read"
                (click)="markRead(notification)"
              >
                <ng-icon
                  [name]="eventIcon(notification.event)"
                  hlmIcon
                  size="sm"
                  [class]="eventIconClass(notification.event)"
                  class="mt-0.5 shrink-0"
                />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium">{{ eventTitle(notification.event) }}</p>
                  <p class="text-xs text-muted-foreground truncate">
                    {{ eventDescription(notification.event) }}
                  </p>
                  <p class="text-xs text-muted-foreground mt-0.5">
                    {{ formatTime(notification.createdAt) }}
                  </p>
                </div>
                @if (!notification.read) {
                  <span class="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0"></span>
                }
              </button>
            }
          }
        </div>
    </div>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationBellComponent {
  #notificationService = inject(NotificationService);

  unreadCount = this.#notificationService.unreadCount;
  badgeText = computed(() => {
    const count = this.unreadCount();
    return count > 9n ? '9+' : count.toString();
  });
  hasUnread = computed(() => this.unreadCount() > 0n);

  notifications = this.#notificationService.notifications;

  eventDescription(event: TypedEvent): string {
    if ('subscriptionActivated' in event) {
      const plan = Object.keys(event.subscriptionActivated.plan)[0];
      return `${plan} plan`;
    }
    if ('paymentReceived' in event) return `${event.paymentReceived.amount} ${event.paymentReceived.tokenId}`;
    if ('depositReceived' in event) return `${event.depositReceived.amount} ${event.depositReceived.tokenId}`;
    if ('autoRenewFailed' in event) return event.autoRenewFailed.reason;
    if ('lowCycles' in event) return `~${event.lowCycles.estimatedDaysLeft} days left`;
    if ('topUpFailed' in event) return event.topUpFailed.reason;
    if ('autoTopUpFailed' in event) return event.autoTopUpFailed.reason;
    if ('updateAvailable' in event) return `v${event.updateAvailable.releaseTag}`;
    if ('trialStarted' in event) return `${Number(event.trialStarted.limitBytes) / 1_000_000} MB limit`;
    return '';
  }

  eventIcon(event: TypedEvent): string {
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
    if ('trialStarted' in event) return 'lucideSparkles';
    if ('updateAvailable' in event) return 'lucideDownload';
    if ('balanceLow' in event) return 'lucideWallet';
    return 'lucideBell';
  }

  eventIconClass(event: TypedEvent): string {
    if ('subscriptionActivated' in event || 'subscriptionRenewed' in event || 'topUpCompleted' in event || 'autoTopUpCompleted' in event) return 'text-green-600';
    if ('subscriptionExpired' in event || 'lowCycles' in event || 'balanceLow' in event) return 'text-amber-600';
    if ('autoRenewFailed' in event || 'topUpFailed' in event || 'autoTopUpFailed' in event) return 'text-red-600';
    return 'text-muted-foreground';
  }

  eventTitle(event: TypedEvent): string {
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
    if ('trialStarted' in event) return 'Trial started';
    if ('updateAvailable' in event) return 'Update available';
    if ('balanceLow' in event) return 'Balance running low';
    return 'Notification';
  }

  formatTime(ns: bigint): string {
    const ms = Number(ns) / 1_000_000;
    const diff = Date.now() - ms;
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
    return new Date(ms).toLocaleDateString();
  }

  markAllAsRead(): void {
    this.#notificationService.markAllAsRead();
  }

  markRead(notification: StoredNotification): void {
    if (!notification.read) {
      this.#notificationService.markAsRead([notification.id]);
    }
  }

  onBellClick(): void {
    this.#notificationService.loadNotifications(20n);
  }
}
