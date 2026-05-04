import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { type ProcessStep, RbthTimelineStepsComponent } from '@rabbithole/ui';

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

@Component({
  selector: 'app-demo-page',
  imports: [RbthTimelineStepsComponent],
  template: `
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-normal">Timeline Steps</h1>
      <p class="text-sm text-muted-foreground">
        Deployment timeline preview for admin monitoring screens.
      </p>
    </header>

    <div class="rounded-lg border bg-muted/50 p-6">
      <rbth-timeline-steps
        title="Deployment · rdmx6-jaaaa-aaaaa-aaadq-cai"
        [steps]="timelineSteps()"
      />
    </div>
  `,
  host: { class: 'flex min-w-0 w-full flex-col gap-6' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoComponent {
  readonly timelineSteps = signal<ProcessStep[]>([...DEMO_TIMELINE_STEPS]);
}
