import { inject, Injectable } from '@angular/core';
import {
  ActivatedRoute,
  type NavigationBehaviorOptions,
  Router,
  UrlSegmentGroup,
} from '@angular/router';

import {
  type UserSettingsDialogSection,
  type UserSettingsProUpgradeSource,
} from './user-settings-dialog.types';

@Injectable({ providedIn: 'root' })
export class UserSettingsDialogResultService {
  #pendingUpgradeResolver: ((upgraded: boolean) => void) | null = null;

  beginUpgrade(): Promise<boolean> {
    this.completeUpgrade(false);

    return new Promise<boolean>((resolve) => {
      this.#pendingUpgradeResolver = resolve;
    });
  }

  completeUpgrade(upgraded: boolean): void {
    this.#pendingUpgradeResolver?.(upgraded);
    this.#pendingUpgradeResolver = null;
  }
}

@Injectable({ providedIn: 'root' })
export class UserSettingsDialogService {
  readonly #results = inject(UserSettingsDialogResultService);
  readonly #router = inject(Router);

  close(): Promise<boolean> {
    this.#results.completeUpgrade(false);
    return this.#navigateDialog(null);
  }

  navigateTo(
    commands: readonly string[],
    options?: UserSettingsDialogNavigationOptions,
  ): Promise<boolean> {
    return this.#navigateDialog(['account', ...commands], options);
  }

  async open(section: UserSettingsDialogSection = 'settings') {
    this.#results.completeUpgrade(false);
    return this.navigateTo([section]);
  }

  async openProUpgrade(
    source: UserSettingsProUpgradeSource = 'subscription',
  ): Promise<boolean> {
    const result = this.#results.beginUpgrade();
    const opened = await this.navigateTo(['subscription', 'upgrade', source]);

    if (!opened) {
      this.#results.completeUpgrade(false);
    }

    return result;
  }

  #navigateDialog(
    commands: readonly string[] | null,
    options: UserSettingsDialogNavigationOptions = {},
  ): Promise<boolean> {
    const dialogParentRoute = findDialogOutletParentRoute(
      this.#router.routerState.root,
    );

    if (commands !== null) {
      return this.#router.navigate([{ outlets: { dialog: commands } }], {
        ...options,
        relativeTo: dialogParentRoute ?? this.#router.routerState.root,
      });
    }

    const tree = this.#router.parseUrl(this.#router.url);
    removeOutlet(tree.root, 'dialog');
    return this.#router.navigateByUrl(tree, options);
  }
}

type UserSettingsDialogNavigationOptions = Pick<
  NavigationBehaviorOptions,
  'replaceUrl'
>;

function findDialogOutletParentRoute(
  route: ActivatedRoute,
): ActivatedRoute | null {
  if (route.routeConfig?.children?.some((child) => child.outlet === 'dialog')) {
    return route;
  }

  for (const child of route.children) {
    const match = findDialogOutletParentRoute(child);
    if (match) return match;
  }

  return null;
}

function removeOutlet(group: UrlSegmentGroup, outlet: string): void {
  delete group.children[outlet];

  for (const child of Object.values(group.children)) {
    removeOutlet(child, outlet);
  }
}
