import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Principal } from '@icp-sdk/core/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucideDatabase } from '@ng-icons/lucide';

import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItemImports } from '@spartan-ng/helm/item';

@Component({
  selector: 'app-storage-item',
  template: ` <a
    hlmItem
    variant="outline"
    class="w-full"
    [routerLink]="[canisterIdText(), 'drive']"
  >
    <div hlmItemMedia>
      <ng-icon hlm name="lucideDatabase" />
    </div>
    <div hlmItemContent>
      <div hlmItemTitle>{{ canisterIdText() }}</div>
    </div>
    <div hlmItemActions>
      <ng-icon hlm name="lucideChevronRight" size="sm" />
    </div>
  </a>`,
  imports: [...HlmItemImports, NgIcon, HlmIcon, RouterLink],
  providers: [provideIcons({ lucideDatabase, lucideChevronRight })],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorageItemComponent {
  canisterId = input.required<Principal>();
  canisterIdText = computed(() => this.canisterId().toText());
}
