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
import { hlm } from '@spartan-ng/helm/utils';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { ClassValue } from 'clsx';

import { RbthTreeLabelDirective } from './tree-item-label.directive';
import { RbthTreeDirective } from './tree-item.directive';
import { TreeNode } from './tree.model';
import { injectTreeConfig } from './tree.token';
import { WithRequiredProperty } from '@rabbithole/core';

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
  selected = model<TreeNode>();
  tree = viewChild.required<CdkTree<TreeNode>>(CdkTree);
  readonly userClass = input<ClassValue>('');
  protected readonly computedClass = computed(() =>
    hlm('contents', this.userClass()),
  );

  constructor() {
    effect(() => {
      const data = this.data();
      if (data.length) {
        this.#expandNodesToLevel(data, 0, 2);
      }
    });
  }

  childrenAccessor = (dataNode: TreeNode) => dataNode.children ?? [];

  expansionKey = (node: TreeNode) => node.path;

  hasChild = (_: number, node: TreeNode) => !!node.children?.length;

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

  trackBy = (index: number, node: TreeNode) => this.expansionKey(node);

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
}
