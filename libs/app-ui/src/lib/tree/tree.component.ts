import { CdkTree, CdkTreeModule } from '@angular/cdk/tree';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { hlm } from '@spartan-ng/brain/core';
import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
import { HlmIconDirective } from '@spartan-ng/ui-icon-helm';
import { ClassValue } from 'clsx';

import { RbthTreeLabelDirective } from './tree-item-label.directive';
import { RbthTreeDirective } from './tree-item.directive';
import { EXAMPLE_DATA } from './tree.contants';
import { NestedNode } from './tree.model';
import { injectTreeConfig } from './tree.token';
import { WithRequiredProperty } from '@rabbithole/core';

function flattenNodes(nodes: NestedNode[]): NestedNode[] {
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
    HlmButtonDirective,
    HlmIconDirective,
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
export class RbthTreeComponent implements AfterViewInit {
  config = injectTreeConfig();
  data = input.required<NestedNode[]>();
  selected = model<NestedNode>();
  tree = viewChild.required<CdkTree<NestedNode>>(CdkTree);
  readonly userClass = input<ClassValue>('');
  protected readonly computedClass = computed(() =>
    hlm('flex h-full flex-col gap-2 *:first:grow', this.userClass()),
  );

  childrenAccessor = (dataNode: NestedNode) => dataNode.children ?? [];

  expansionKey = (node: NestedNode) => node.key;

  hasChild = (_: number, node: NestedNode) => !!node.children?.length;

  ngAfterViewInit(): void {
    this.#expandNodesToLevel(EXAMPLE_DATA, 0, 2);
  }

  shouldRender(node: NestedNode) {
    let parent = this.#getParentNode(node);
    while (parent) {
      if (!this.tree().isExpanded(parent)) {
        return false;
      }
      parent = this.#getParentNode(parent);
    }
    return true;
  }

  trackBy = (index: number, node: NestedNode) => this.expansionKey(node);

  #expandNodesToLevel(
    nodes: NestedNode[],
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

  #getParentNode(node: NestedNode) {
    for (const parent of flattenNodes(EXAMPLE_DATA)) {
      if (parent.children?.includes(node)) {
        return parent;
      }
    }

    return null;
  }

  #isExpandable(
    node: NestedNode,
  ): node is WithRequiredProperty<NestedNode, 'children'> {
    return !!node.children?.length;
  }
}
