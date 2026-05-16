import { CdkTree, CdkTreeModule } from '@angular/cdk/tree';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  model,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideFile,
  lucideFolder,
  lucideFolderOpen,
} from '@ng-icons/lucide';
import { ClassValue } from 'clsx';

import { HlmIcon } from '@spartan-ng/helm/icon';
import { hlm } from '@spartan-ng/helm/utils';

import { RbthTreeLabelDirective } from './tree-item-label.directive';
import { RbthTreeDirective } from './tree-item.directive';
import { TreeNode } from './tree.model';
import { injectTreeConfig } from './tree.token';

export type TreeSelectableMode = 'all' | 'files' | 'folders';

export type WithRequiredProperty<Type, Key extends keyof Type> = {
  [Property in Key]-?: Type[Property];
} & Type;

function flattenNodes(nodes: TreeNode[]): TreeNode[] {
  const flattenedNodes = [];
  for (const node of nodes) {
    flattenedNodes.push(node);
    if (node.children) {
      flattenedNodes.push(...flattenNodes(node.children));
    }
  }
  return flattenedNodes;
}

@Component({
  selector: 'rbth-tree',
  imports: [
    NgIcon,
    HlmIcon,
    CdkTreeModule,
    RbthTreeDirective,
    RbthTreeLabelDirective,
  ],
  providers: [
    provideIcons({
      lucideFolder,
      lucideFolderOpen,
      lucideChevronDown,
      lucideFile,
    }),
  ],
  templateUrl: './tree.component.html',
  host: {
    '[class]': 'computedClass()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthTreeComponent {
  config = injectTreeConfig();
  data = input.required<TreeNode[]>();

  expandedKeys = model<readonly string[] | undefined>(undefined);
  selectable = input<TreeSelectableMode>('all');
  selected = model<TreeNode>();
  tree = viewChild.required<CdkTree<TreeNode>>(CdkTree);
  readonly userClass = input<ClassValue>('');
  protected readonly computedClass = computed(() =>
    hlm('contents', this.userClass()),
  );
  #expansionJobId = 0;
  #isApplyingExpansion = false;

  constructor() {
    effect(() => {
      const data = this.data();
      const expandedKeys = this.expandedKeys();
      if (!data.length) {
        return;
      }

      this.#scheduleApplyExpansion(data, expandedKeys);
    });
  }

  childrenAccessor = (dataNode: TreeNode) => dataNode.children ?? [];

  expansionKey = (node: TreeNode) => node.path;

  hasChild = (_: number, node: TreeNode) => !!node.children?.length;

  isFolder(node: TreeNode): boolean {
    return node.kind === 'directory' || node.children !== undefined;
  }

  isSelectable(node: TreeNode): boolean {
    const selectable = this.selectable();
    if (selectable === 'all') return true;
    if (selectable === 'folders') return this.isFolder(node);
    return !this.isFolder(node);
  }

  rememberExpansionState(): void {
    if (this.#isApplyingExpansion) {
      return;
    }

    queueMicrotask(() => {
      const expandedKeys = this.#collectExpandedKeys();
      this.expandedKeys.set(expandedKeys);
    });
  }

  select(node: TreeNode): void {
    if (this.isSelectable(node)) {
      this.selected.set(node);
    }
  }

  shouldRender(node: TreeNode) {
    let parent = this.#getParentNode(node);
    while (parent) {
      if (!this.tree().isExpanded(parent)) {
        return false;
      }
      parent = this.#getParentNode(parent);
    }
    return true;
  }

  trackBy = (_index: number, node: TreeNode) => this.expansionKey(node);

  #applyExpansion(apply: () => void): void {
    this.#isApplyingExpansion = true;
    apply();
    queueMicrotask(() => {
      this.#isApplyingExpansion = false;
    });
  }

  #collectExpandedKeys(): string[] {
    const expandedKeys = flattenNodes(this.data())
      .filter((node) => this.#isExpandable(node) && this.tree().isExpanded(node))
      .map((node) => this.expansionKey(node))
      .filter((key): key is string => !!key);

    return expandedKeys;
  }

  #expandNodesToLevel(
    nodes: TreeNode[],
    currentLevel: number,
    targetLevel: number,
  ) {
    if (currentLevel > targetLevel) {
      return;
    }
    const tree = this.tree();
    const level = currentLevel + 1;
    for (const node of nodes) {
      if (this.#isExpandable(node) && currentLevel < targetLevel) {
        tree.expand(node);
        this.#expandNodesToLevel(node.children, level, targetLevel);
      }
    }
  }

  #getParentNode(node: TreeNode) {
    for (const parent of flattenNodes(this.data())) {
      if (parent.children?.includes(node)) {
        return parent;
      }
    }

    return null;
  }

  #isExpandable(
    node: TreeNode,
  ): node is WithRequiredProperty<TreeNode, 'children'> {
    return !!node.children?.length;
  }

  #restoreExpandedKeys(nodes: TreeNode[], expandedKeys: readonly string[]) {
    const tree = this.tree();
    const expandedKeySet = new Set(expandedKeys);

    tree.collapseAll();

    for (const node of flattenNodes(nodes)) {
      const key = this.expansionKey(node);
      if (key && expandedKeySet.has(key) && this.#isExpandable(node)) {
        tree.expand(node);
      }
    }
  }

  #scheduleApplyExpansion(
    data: TreeNode[],
    expandedKeys: readonly string[] | undefined,
  ): void {
    const jobId = ++this.#expansionJobId;

    setTimeout(() => {
      if (jobId !== this.#expansionJobId) {
        return;
      }

      if (expandedKeys === undefined) {
        this.#applyExpansion(() => this.#expandNodesToLevel(data, 0, 2));
      } else {
        this.#applyExpansion(() => this.#restoreExpandedKeys(data, expandedKeys));
      }
    });
  }
}
