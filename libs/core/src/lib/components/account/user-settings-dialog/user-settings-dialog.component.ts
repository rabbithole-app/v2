import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterOutlet,
} from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCreditCard,
  lucideRefreshCw,
  lucideSettings,
  lucideWallet,
  lucideX,
} from '@ng-icons/lucide';
import type { BrnDialogState } from '@spartan-ng/brain/dialog';
import { filter, startWith } from 'rxjs';

import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSidebarImports } from '@spartan-ng/helm/sidebar';

import { BalanceService } from '../../../services/balance.service';
import {
  UserSettingsDialogResultService,
  UserSettingsDialogService,
} from './user-settings-dialog.service';
import type { UserSettingsDialogSection } from './user-settings-dialog.types';

interface UserSettingsRouteState {
  backCommands: readonly string[] | null;
  backLabel: string;
  section: UserSettingsDialogSection;
  title: string;
  upgradeFlow: boolean;
  walletRefresh: boolean;
}

const DEFAULT_ROUTE_STATE: UserSettingsRouteState = {
  backCommands: null,
  backLabel: '',
  section: 'settings',
  title: 'Settings',
  upgradeFlow: false,
  walletRefresh: false,
};

@Component({
  selector: 'rbth-core-user-settings-dialog',
  imports: [
    HlmButton,
    ...HlmDialogImports,
    HlmIcon,
    ...HlmSidebarImports,
    NgIcon,
    RouterOutlet,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCreditCard,
      lucideRefreshCw,
      lucideSettings,
      lucideWallet,
      lucideX,
    }),
  ],
  templateUrl: './user-settings-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserSettingsDialogComponent {
  readonly dialogState = signal<BrnDialogState>('open');
  readonly routeState = signal<UserSettingsRouteState>(DEFAULT_ROUTE_STATE);
  readonly #balanceService = inject(BalanceService);
  readonly #destroyRef = inject(DestroyRef);
  readonly #route = inject(ActivatedRoute);
  readonly #router = inject(Router);
  readonly #settingsDialogResults = inject(UserSettingsDialogResultService);

  readonly #settingsDialogService = inject(UserSettingsDialogService);

  constructor() {
    this.#router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        startWith(null),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.updateRouteState());

    this.#destroyRef.onDestroy(() => {
      this.#settingsDialogResults.completeUpgrade(false);
    });
  }

  activeSection(): UserSettingsDialogSection {
    return this.routeState().section;
  }

  close(): void {
    void this.#settingsDialogService.close();
  }

  handleDialogStateChanged(state: BrnDialogState): void {
    this.dialogState.set(state);

    if (state === 'closed') {
      this.close();
    }
  }

  handleHeaderBack(): void {
    const commands = this.routeState().backCommands;
    if (!commands) return;

    this.#settingsDialogResults.completeUpgrade(false);
    void this.#settingsDialogService.navigateTo(commands);
  }

  refreshWallet(): void {
    this.#balanceService.reload();
  }

  selectSection(section: UserSettingsDialogSection): void {
    void this.#settingsDialogService.open(section);
  }

  private updateRouteState(): void {
    const child = findDeepestChild(this.#route);
    const data = child.snapshot.data;
    const nextState = {
      backCommands:
        (data['backCommands'] as readonly string[] | undefined) ?? null,
      backLabel: (data['backLabel'] as string | undefined) ?? '',
      section:
        (data['section'] as UserSettingsDialogSection | undefined) ??
        'settings',
      title: (data['title'] as string | undefined) ?? 'Settings',
      upgradeFlow: data['upgradeFlow'] === true,
      walletRefresh: data['walletRefresh'] === true,
    };

    if (this.routeState().upgradeFlow && !nextState.upgradeFlow) {
      this.#settingsDialogResults.completeUpgrade(false);
    }

    this.routeState.set(nextState);
  }
}

function findDeepestChild(route: ActivatedRoute): ActivatedRoute {
  let current = route;

  while (current.firstChild) {
    current = current.firstChild;
  }

  return current;
}
