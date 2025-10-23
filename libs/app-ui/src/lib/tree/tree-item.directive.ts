import { CdkTreeNode } from '@angular/cdk/tree';
import { computed, Directive, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { hlm } from '@spartan-ng/helm/utils';
import { ClassValue } from 'clsx';
import { isDeepEqual } from 'remeda';
import { asapScheduler } from 'rxjs';
import { map, observeOn } from 'rxjs/operators';

import { RbthTreeComponent } from './tree.component';
import { injectTreeConfig } from './tree.token';

@Directive({
  selector: 'cdk-tree-node[rbthTreeItem]',
  host: {
    '[class]': 'computedClass()',
    'data-slot': 'tree-item',
    '[style.--tree-padding]': 'treePadding()',
    '[attr.data-folder]': 'isExpandable()',
    '[attr.data-disabled]': 'isDisabled()',
    '[attr.data-selected]': 'isSelected()',
    '[attr.data-drag-target]': 'false',
    '[attr.data-search-match]': 'false',
  },
})
export class RbthTreeDirective {
  cdkTreeNode = inject(CdkTreeNode, { self: true });
  isDisabled = toSignal(
    this.cdkTreeNode._dataChanges
      .asObservable()
      .pipe(map(() => this.cdkTreeNode.isDisabled)),
    { initialValue: this.cdkTreeNode.isDisabled },
  );
  isExpandable = toSignal(
    this.cdkTreeNode._dataChanges.asObservable().pipe(
      observeOn(asapScheduler),
      map(() => this.cdkTreeNode.isExpandable),
    ),
    { initialValue: this.cdkTreeNode.isExpandable },
  );
  #treeComponent = inject(RbthTreeComponent);
  isSelected = computed(() =>
    isDeepEqual(this.#treeComponent.selected(), this.cdkTreeNode.data),
  );
  protected config = injectTreeConfig();
  // wrapping in computed allows you to get the value ща думуд after initialization cdkTreeNode
  // treePadding = computed(
  //   () => `${this.cdkTreeNode.level * this.config.indent}px`,
  // );
  treePadding = toSignal(
    this.cdkTreeNode._dataChanges
      .asObservable()
      .pipe(map(() => `${this.cdkTreeNode.level * this.config.indent}px`)),
    { initialValue: '0px' },
  );
  readonly userClass = input<ClassValue>('');
  protected readonly computedClass = computed(() =>
    hlm(
      'z-10 ps-(--tree-padding) outline-hidden select-none not-last:pb-0.5 focus:z-20 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      this.userClass(),
    ),
  );
}
