import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  Directive,
  inject,
  input,
  model,
  signal,
  TemplateRef,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideFile,
  lucideFolder,
  lucideHardDrive,
} from '@ng-icons/lucide';
import { BrnDialogState } from '@spartan-ng/brain/dialog';
import { BrnPopoverImports } from '@spartan-ng/brain/popover';
import { cva } from 'class-variance-authority';
import type { ClassValue } from 'clsx';

import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmPopoverImports } from '@spartan-ng/helm/popover';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { hlm } from '@spartan-ng/helm/utils';

import {
  RbthTreeComponent,
} from '../tree/tree.component';
import type { TreeSelectableMode } from '../tree/tree.component';
import type { TreeNode } from '../tree/tree.model';

export type RbthTreeSelectTriggerContext = {
  loading: boolean;
  placeholder: string;
  selected: RbthTreeSelectValue | undefined;
};

export type RbthTreeSelectValue =
  | {
      kind: 'node';
      node: TreeNode;
    }
  | {
      kind: 'root';
    };

const rootOptionVariants = cva(
  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
  {
    variants: {
      selected: {
        true: 'bg-accent font-medium text-accent-foreground',
        false: '',
      },
    },
    defaultVariants: {
      selected: false,
    },
  },
);

@Directive({
  selector: 'ng-template[rbthTreeSelectTrigger]',
})
export class RbthTreeSelectTriggerDirective {
  readonly templateRef =
    inject<TemplateRef<RbthTreeSelectTriggerContext>>(TemplateRef);
}

@Component({
  selector: 'rbth-tree-select',
  templateUrl: "./tree-select.component.html",
  imports: [
    ...BrnPopoverImports,
    HlmIcon,
    ...HlmPopoverImports,
    HlmSpinner,
    NgIcon,
    NgTemplateOutlet,
    RbthTreeComponent,
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideFile,
      lucideFolder,
      lucideHardDrive,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthTreeSelectComponent {
  readonly allowRoot = input(false);
  readonly disabled = input(false);
  readonly emptyLabel = input('No items');
  readonly expandedKeys = signal<readonly string[] | undefined>(undefined);
  readonly loading = input(false);
  readonly placeholder = input('Choose item');
  readonly popoverState = signal<BrnDialogState>('closed');
  readonly rootLabel = input('Root');
  readonly selectable = input<TreeSelectableMode>('all');
  readonly selected = model<RbthTreeSelectValue | undefined>();
  readonly selectedNode = computed(() => {
    const selected = this.selected();
    return selected?.kind === 'node' ? selected.node : undefined;
  });
  readonly tree = input.required<TreeNode[]>();
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  readonly triggerClass = computed(() =>
    hlm(
      'border-input data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full items-center justify-between gap-1.5 rounded-md border bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50',
      this.popoverState() === 'open' ? 'shadow-none' : 'shadow-xs',
      this.userClass(),
    ),
  );

  readonly triggerContext = computed<RbthTreeSelectTriggerContext>(() => ({
    loading: this.loading(),
    placeholder: this.placeholder(),
    selected: this.selected(),
  }));

  readonly triggerTemplate = contentChild(RbthTreeSelectTriggerDirective);

  isFolder(node: TreeNode): boolean {
    return node.kind === 'directory' || node.children !== undefined;
  }

  rootOptionClass(): string {
    return rootOptionVariants({ selected: this.selected()?.kind === 'root' });
  }

  selectedIcon(): string {
    const selected = this.selected();
    if (!selected || selected.kind === 'root') return 'lucideHardDrive';
    return this.isFolder(selected.node) ? 'lucideFolder' : 'lucideFile';
  }

  selectedLabel(): string {
    const selected = this.selected();
    if (!selected) return this.placeholder();
    if (selected.kind === 'root') return this.rootLabel();
    const prefix = this.isFolder(selected.node) ? 'Folder' : 'File';
    return `${prefix}: ${selected.node.path ?? selected.node.name}`;
  }

  selectNode(node: TreeNode | undefined): void {
    if (!node?.path) return;
    this.selected.set({ kind: 'node', node });
    this.popoverState.set('closed');
  }

  selectRoot(): void {
    this.selected.set({ kind: 'root' });
    this.popoverState.set('closed');
  }

  setExpandedKeys(expandedKeys: readonly string[] | undefined): void {
    this.expandedKeys.set(expandedKeys);
  }

  setPopoverState(state: BrnDialogState): void {
    this.popoverState.set(state);
  }
}
