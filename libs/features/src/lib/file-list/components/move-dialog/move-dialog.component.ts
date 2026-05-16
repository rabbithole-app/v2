import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronRight,
  lucideFolder,
  lucideFolderOpen,
} from '@ng-icons/lucide';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { cva } from 'class-variance-authority';
import { SignalMap } from 'ngxtension/collections';

import { EncryptedStorage, Entry, TreeNode } from '@rabbithole/encrypted-storage';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

interface FlatTreeItem {
  children?: FlatTreeItem[];
  disabled: boolean;
  expanded: boolean;
  level: number;
  name: string;
  path: string;
}

const moveTargetVariants = cva(
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
  {
    variants: {
      selected: {
        true: 'bg-accent text-accent-foreground',
        false: '',
      },
      disabled: {
        true: 'cursor-not-allowed opacity-40',
        false: 'hover:bg-accent hover:text-accent-foreground',
      },
    },
    defaultVariants: {
      selected: false,
      disabled: false,
    },
  },
);

@Component({
  selector: 'rbth-feat-move-dialog',
  template: `
    <hlm-dialog-header>
      <h3 hlmDialogTitle>Move to</h3>
    </hlm-dialog-header>

    <div class="py-4 max-h-[400px] overflow-y-auto min-h-[200px]">
      @if (loading()) {
        <div class="flex justify-center py-8">
          <hlm-spinner />
        </div>
      } @else {
        @if (showRoot()) {
          <button
            [class]="rootButtonClass()"
            (click)="rootDisabled || select(null)"
          >
            <ng-icon name="lucideFolder" class="!size-4" />
            Root
          </button>
        }
        @for (item of flatItems(); track item.path) {
          <button
            [class]="itemButtonClasses.get(item.path)"
            [style.padding-left.px]="8 + item.level * 20"
            (click)="select(item)"
          >
            @if (item.children?.length) {
              <ng-icon
                name="lucideChevronRight"
                class="!size-3 transition-transform"
                [class.rotate-90]="item.expanded"
                (click)="toggle(item, $event)"
              />
            } @else {
              <span class="w-3"></span>
            }
            <ng-icon
              [name]="item.expanded ? 'lucideFolderOpen' : 'lucideFolder'"
              class="!size-4"
            />
            {{ item.name }}
          </button>
        }
      }
    </div>

    <hlm-dialog-footer>
      <button hlmBtn variant="outline" (click)="dialogRef.close()">
        Cancel
      </button>
      <button hlmBtn (click)="submit()" [disabled]="selectedPath() === null">
        Move here
      </button>
    </hlm-dialog-footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIcon,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmDialogFooter,
    HlmButton,
    HlmSpinner,
  ],
  providers: [
    provideIcons({ lucideChevronRight, lucideFolder, lucideFolderOpen }),
  ],
})
export class MoveDialogComponent {
  readonly dialogRef = inject(BrnDialogRef);
  readonly flatItems = signal<FlatTreeItem[]>([]);
  readonly itemButtonClasses = new SignalMap<string, string>();
  readonly loading = signal(true);
  readonly #context = injectBrnDialogContext<{ currentParentPaths: (string | null)[]; encryptedStorage: EncryptedStorage; excludePaths?: string[]; }>();
  readonly #currentParentPaths = this.#context.currentParentPaths;
  readonly rootDisabled = this.#currentParentPaths.includes(null);
  readonly selectedPath = signal<string | null>(null);
  readonly rootButtonClass = computed(() =>
    moveTargetVariants({
      disabled: this.rootDisabled,
      selected: this.selectedPath() === '',
    }),
  );
  readonly showRoot = signal(false);
  readonly #encryptedStorage = this.#context.encryptedStorage;
  readonly #excludePaths = this.#context.excludePaths ?? [];
  readonly #expandedPaths = new Set(this.#currentParentPaths.flatMap((p) => {
    if (p == null) return [];
    const segments = p.split('/');
    return segments.map((_, i) => segments.slice(0, i + 1).join('/'));
  }));
  #tree: FlatTreeItem[] = [];

  constructor() {
    this.#loadTree();
  }

  select(item: FlatTreeItem | null) {
    if (item?.disabled) return;
    this.selectedPath.set(item?.path ?? '');
    this.#syncItemButtonClasses();
  }

  submit() {
    const path = this.selectedPath();
    if (path === null) return;
    // Empty string means root — close with null to signal "move to root"
    if (path === '') {
      this.dialogRef.close(null);
    } else {
      const entry: Entry = ['Directory', path];
      this.dialogRef.close(entry);
    }
  }

  toggle(item: FlatTreeItem, event: Event) {
    event.stopPropagation();
    item.expanded = !item.expanded;
    this.#setFlatItems(this.#flatten(this.#tree));
  }

  #convertTree(nodes: TreeNode[], level: number, parentExcluded = false): FlatTreeItem[] {
    return nodes
      .filter((node) => node.children !== undefined)
      .map((node) => {
        const path = node.path ?? node.name;
        const isCurrent = this.#currentParentPaths.includes(path);
        const isExcluded = parentExcluded || this.#excludePaths.some(
          (ep) => path === ep || path.startsWith(ep + '/'),
        );
        return {
          name: node.name,
          path,
          level,
          expanded: this.#expandedPaths.has(path),
          disabled: isCurrent || isExcluded,
          children: node.children
            ? this.#convertTree(node.children, level + 1, isExcluded)
            : undefined,
        };
      });
  }

  #flatten(items: FlatTreeItem[]): FlatTreeItem[] {
    const result: FlatTreeItem[] = [];
    for (const item of items) {
      result.push(item);
      if (item.expanded && item.children) {
        result.push(...this.#flatten(item.children));
      }
    }
    return result;
  }

  async #loadTree() {
    try {
      const tree = await this.#encryptedStorage.fsTree();
      // If all top-level items have no "/" in name, this is a full tree (owner) — show Root
      // If items have "/" in name, these are writable roots for shared users — no Root
      const isFullTree = tree.length > 0 && tree.every((n) => !n.name?.includes('/'));
      this.showRoot.set(isFullTree);
      this.#tree = this.#convertTree(tree, 0);
      this.#setFlatItems(this.#flatten(this.#tree));
    } finally {
      this.loading.set(false);
    }
  }

  #setFlatItems(items: FlatTreeItem[]): void {
    this.flatItems.set(items);
    this.#syncItemButtonClasses();
  }

  #syncItemButtonClasses(): void {
    const items = this.flatItems();
    const paths = new Set(items.map((item) => item.path));
    const selectedPath = this.selectedPath();

    for (const item of items) {
      this.itemButtonClasses.set(
        item.path,
        moveTargetVariants({
          disabled: item.disabled,
          selected: selectedPath === item.path,
        }),
      );
    }

    for (const path of this.itemButtonClasses.keys()) {
      if (!paths.has(path)) {
        this.itemButtonClasses.delete(path);
      }
    }
  }
}
