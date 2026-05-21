import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { type ProcessStep, RbthTimelineStepsComponent } from '@rabbithole/ui';
import { TreeNode } from '@rabbithole/ui/tree';
import {
  RbthTreeSelectComponent,
  RbthTreeSelectValue,
} from '@rabbithole/ui/tree-select';

const DEMO_TIMELINE_STEPS: ProcessStep[] = [
  {
    completedDescription: 'Reserved canister rdmx6-jaaaa-aaaaa-aaadq-cai.',
    description: 'Reserving a new canister on subnet rpjhl-staz...',
    id: 'reserve-canister',
    meta: '12:04:21',
    status: 'completed',
    title: 'Reserving canister',
  },
  {
    completedDescription: '2T cycles transferred from CMC.',
    description: 'Transferring cycles from CMC to the new canister.',
    id: 'fund-cycles',
    meta: '12:04:24',
    status: 'completed',
    title: 'Funding cycles',
  },
  {
    completedDescription: 'All 12 WASM chunks uploaded.',
    description: 'Uploading encrypted storage module chunks.',
    id: 'upload-wasm',
    meta: 'Running now...',
    progress: { current: 7, total: 12 },
    status: 'in-progress',
    title: 'Uploading WASM chunks',
  },
  {
    description: 'Matching module hash against the known registry.',
    id: 'verify-hash',
    meta: 'Queued',
    status: 'pending',
    title: 'Verifying module hash',
  },
  {
    description: 'Calling install_code on the target canister.',
    id: 'install-code',
    meta: 'Queued',
    status: 'pending',
    title: 'Installing storage module',
  },
  {
    description: 'Publish the user interface assets.',
    id: 'upload-assets',
    meta: 'Queued',
    status: 'pending',
    title: 'Uploading interface',
  },
  {
    description: 'Return full control to the user; drop installer access.',
    id: 'transfer-controllers',
    meta: 'Queued',
    status: 'pending',
    title: 'Transferring controllers',
  },
  {
    description: 'Storage becomes available to the user.',
    id: 'ready',
    meta: 'Queued',
    status: 'pending',
    title: 'Ready',
  },
];

const DEMO_SCOPE_TREE: TreeNode[] = [
  {
    name: 'Investigations',
    kind: 'directory',
    path: 'Investigations',
    children: [
      {
        name: '2026',
        kind: 'directory',
        path: 'Investigations/2026',
        children: [
          {
            name: 'Sources',
            kind: 'directory',
            path: 'Investigations/2026/Sources',
            children: [
              {
                name: 'interview-notes.md',
                kind: 'file',
                path: 'Investigations/2026/Sources/interview-notes.md',
              },
              {
                name: 'documents.zip',
                kind: 'file',
                path: 'Investigations/2026/Sources/documents.zip',
              },
            ],
          },
          {
            name: 'Drafts',
            kind: 'directory',
            path: 'Investigations/2026/Drafts',
            children: [
              {
                name: 'story-outline.md',
                kind: 'file',
                path: 'Investigations/2026/Drafts/story-outline.md',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Personal',
    kind: 'directory',
    path: 'Personal',
    children: [
      {
        name: 'Emergency packet',
        kind: 'directory',
        path: 'Personal/Emergency packet',
        children: [],
      },
      {
        name: 'passport.pdf',
        kind: 'file',
        path: 'Personal/passport.pdf',
      },
    ],
  },
  {
    name: 'README.md',
    kind: 'file',
    path: 'README.md',
  },
];

@Component({
  selector: 'app-demo-page',
  imports: [RbthTimelineStepsComponent, RbthTreeSelectComponent],
  templateUrl: "./demo.component.html",
  host: { class: 'flex min-w-0 w-full flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoComponent {
  readonly requiredScope = signal<RbthTreeSelectValue | undefined>(undefined);
  readonly scopeTree = DEMO_SCOPE_TREE;
  readonly selectedScope = signal<RbthTreeSelectValue | undefined>({
    kind: 'root',
  });
  readonly timelineSteps = signal<ProcessStep[]>([...DEMO_TIMELINE_STEPS]);

  scopeLabel(scope: RbthTreeSelectValue | undefined): string {
    if (!scope) return 'none';
    if (scope.kind === 'root') return 'Whole storage';
    return `${scope.node.kind ?? 'node'}: ${scope.node.path ?? scope.node.name}`;
  }
}
