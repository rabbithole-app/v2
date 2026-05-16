import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { RbthTreeComponent } from './tree.component';
import { TreeNode } from './tree.model';

@Component({
  imports: [RbthTreeComponent],
  template: `
    @if (open()) {
      <rbth-tree
        [data]="tree"
        [expandedKeys]="expandedKeys()"
        (expandedKeysChange)="expandedKeys.set($event)"
      />
    }
  `,
})
class TreeHostComponent {
  readonly expandedKeys = signal<readonly string[] | undefined>(undefined);
  readonly open = signal(true);
  readonly tree: TreeNode[] = [
    {
      name: 'Investigations',
      path: '/Investigations',
      kind: 'directory',
      children: [
        {
          name: 'Field notes',
          path: '/Investigations/Field notes',
          kind: 'directory',
          children: [
            {
              name: 'README.md',
              path: '/Investigations/Field notes/README.md',
              kind: 'file',
            },
          ],
        },
      ],
    },
  ];
}

describe(RbthTreeComponent.name, () => {
  async function createFixture(): Promise<ComponentFixture<TreeHostComponent>> {
    TestBed.configureTestingModule({
      imports: [TreeHostComponent],
    });

    const fixture = TestBed.createComponent(TreeHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('stores collapsed nodes externally and restores them after remount', async () => {
    const fixture = await createFixture();
    const host = fixture.componentInstance;
    await nextTask();

    expect(host.expandedKeys()).toBeUndefined();

    clickFirstToggle(fixture);
    await fixture.whenStable();
    await new Promise((resolve) => queueMicrotask(resolve));
    await nextTask();
    fixture.detectChanges();

    expect(host.expandedKeys()).not.toContain('/Investigations');
    expect(host.expandedKeys()).toContain('/Investigations/Field notes');

    host.open.set(false);
    fixture.detectChanges();
    host.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    await nextTask();
    fixture.detectChanges();

    const expandedNodeNames = expandedTreeNodeNames(fixture);
    expect(expandedNodeNames).not.toContain('Investigations');
    expect(expandedNodeNames).not.toContain('Field notes');
  });
});

function clickFirstToggle(fixture: ComponentFixture<TreeHostComponent>): void {
  const toggle = fixture.nativeElement.querySelector(
    'cdk-tree-node[aria-expanded] [cdktreenodetoggle]',
  ) as HTMLElement | null;

  expect(toggle).not.toBeNull();
  toggle?.click();
}

function expandedTreeNodeNames(
  fixture: ComponentFixture<TreeHostComponent>,
): string[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll('cdk-tree-node[aria-expanded="true"]'),
  ).map((node) => node.textContent?.trim() ?? '');
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}
