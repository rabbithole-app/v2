import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLock } from '@ng-icons/lucide';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';

import {
  RbthDrawerComponent,
  RbthDrawerContentComponent,
  RbthDrawerHeaderComponent,
  RbthDrawerTitleDirective,
} from '@rabbithole/ui/drawer';
import { HlmBadge } from '@spartan-ng/helm/badge';

import { isDirectory, isFile, NodeItem } from '../../types';

@Component({
  selector: 'rbth-feat-properties-drawer',
  templateUrl: "./properties-drawer.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgIcon,
    BrnSheetContent,
    RbthDrawerComponent,
    RbthDrawerContentComponent,
    RbthDrawerHeaderComponent,
    RbthDrawerTitleDirective,
    HlmBadge,
  ],
  providers: [provideIcons({ lucideLock })],
})
export class PropertiesDrawerComponent {
  isFileItem = isFile;

  items = input.required<NodeItem[]>();

  singleItem = computed(() =>
    this.items().length === 1 ? this.items()[0] : null,
  );

  totalSize = computed(() =>
    this.items().reduce(
      (sum, item) => sum + (isFile(item) ? item.size : 0n),
      0n,
    ),
  );

  typesSummary = computed(() => {
    const files = this.items().filter(isFile).length;
    const dirs = this.items().filter(isDirectory).length;
    const parts: string[] = [];
    if (files) parts.push(`${files} file(s)`);
    if (dirs) parts.push(`${dirs} folder(s)`);
    return parts.join(', ');
  });

  private readonly drawer = viewChild(RbthDrawerComponent);

  encryptionBadgeVariant(item: NodeItem) {
    return this.encryptionMode(item) === 'encrypted'
      ? ('default' as const)
      : ('secondary' as const);
  }

  encryptionMode(item: NodeItem) {
    if (isFile(item)) return item.encryptionMode;
    if (isDirectory(item)) return item.defaultEncryptionMode;
    return 'encrypted';
  }

  formatSize(bytes: bigint | number) {
    const n = Number(bytes);
    if (n === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(n) / Math.log(k));
    return `${parseFloat((n / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  open() {
    this.drawer()?.open();
  }
}
