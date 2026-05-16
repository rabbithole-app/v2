import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CellContext, injectFlexRenderContext } from '@tanstack/angular-table';

import { StoragePermissionItem } from '@rabbithole/encrypted-storage';
import { CopyToClipboardComponent } from '@rabbithole/ui/copy-to-clipboard';

export type AccessTargetProfile = {
  subtitle: string;
  title: string;
};

@Component({
  standalone: true,
  imports: [CopyToClipboardComponent],
  templateUrl: "./access-target-cell.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'contents',
  },
})
export class AccessTargetCell {
  readonly currentPrincipalId = input<string | undefined>();
  readonly #context =
    injectFlexRenderContext<CellContext<StoragePermissionItem, unknown>>();
  readonly item = computed(() => this.#context.row.original);

  readonly emailSubtitle = computed(() => {
    const claims = this.item().claimedPrincipals ?? [];
    if (claims.length === 0) return 'Pending email invite';
    if (claims.length > 1) return 'Rabbithole and storage accounts linked';
    return claims[0].origin === 'rabbithole'
      ? 'Rabbithole account linked'
      : 'Storage account linked';
  });
  readonly hasDisplayEmail = computed(() => this.item().targetKind === 'email');
  readonly targetValue = computed(() => this.item().user);
  readonly isCurrentUser = computed(
    () => this.currentPrincipalId() === this.targetValue(),
  );
  readonly isEmailInvite = computed(() =>
    this.item().targetKind === 'email' ||
    this.item().targetKind === 'emailCommitment',
  );
  readonly profile = input<AccessTargetProfile | null>(null);
  readonly resolvedProfile = computed(() => this.profile());
  readonly shortPrincipal = computed(() => {
    const value = this.targetValue();
    return value.length > 18
      ? `${value.slice(0, 8)}...${value.slice(-6)}`
      : value;
  });
}
