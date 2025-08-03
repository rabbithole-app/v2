import { ChangeDetectionStrategy, Component } from '@angular/core';

import { EXAMPLE_DATA, NestedNode, RbthTreeComponent } from '@rabbithole/ui';

@Component({
  selector: 'app-fs-tree',
  imports: [RbthTreeComponent],
  template: ` <rbth-tree
    [data]="treeData"
    (selectedChange)="handleSelect($event)"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FSTree {
  readonly treeData = EXAMPLE_DATA;

  handleSelect(node: NestedNode | undefined) {
    console.log(node);
  }
}
