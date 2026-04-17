import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { NgIcon, provideIcons } from "@ng-icons/core";
import { lucideRotateCcw } from "@ng-icons/lucide";

import {
  CopyToClipboardComponent,
  WalletNetworksViewComponent,
} from "@rabbithole/core";
import {
  OnboardingChecklistComponent,
  type OnboardingStep,
  type ProcessStep,
  type ProcessStepStatus,
  RbthFrameComponent,
  RbthFrameDescriptionDirective,
  RbthFrameFooterDirective,
  RbthFrameHeaderDirective,
  RbthFramePanelDirective,
  RbthFrameTitleDirective,
  RbthStepComponent,
  RbthStepMetaDirective,
  RbthStepProgressDirective,
  RbthStepsComponent,
  RbthStepsDescriptionDirective,
  RbthStepsFooterDirective,
  RbthStepsHeaderDirective,
  RbthStepsTitleDirective,
} from "@rabbithole/ui";
import { HlmButtonImports } from "@spartan-ng/helm/button";

const DEMO_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    actionLabel: "Edit profile",
    completed: true,
    description:
      "Add your name, photo, and role so your team knows who you are.",
    id: "profile",
    title: "Complete your profile",
  },
  {
    actionLabel: "Configure workspace",
    completed: false,
    description:
      "Customize your workspace with a name, icon, and default settings.",
    id: "workspace",
    title: "Set up your workspace",
  },
  {
    actionLabel: "Send invites",
    completed: false,
    description:
      "Bring your teammates on board so you can collaborate in real time.",
    id: "invite",
    title: "Invite your team",
  },
];

const DEMO_PROCESS_STEPS: ProcessStep[] = [
  {
    completedDescription: "Canister created successfully.",
    description: "Create the user's storage canister on the Internet Computer.",
    id: "canister",
    meta: "rdmx6-jaaaa-aaaaa-aaadq-cai",
    metaLabel: "Canister ID",
    status: "completed",
    title: "Creating canister",
  },
  {
    completedDescription: "Storage module installed on the canister.",
    description: "Install the encrypted storage module.",
    id: "wasm",
    progress: { current: 7, total: 12 },
    status: "in-progress",
    title: "Installing storage module",
  },
  {
    completedDescription: "Interface uploaded and ready to load.",
    description: "Publish the user interface assets.",
    id: "frontend",
    status: "pending",
    title: "Uploading interface",
  },
  {
    completedDescription:
      "Temporary installer access removed and control returned to you.",
    description:
      "Return full control to the user and remove temporary installer access.",
    id: "finalize",
    status: "pending",
    title: "Finalizing access",
  },
];

const DEMO_PROCESS_ERROR: ProcessStep[] = [
  {
    completedDescription: "Canister created successfully.",
    id: "canister",
    status: "completed",
    meta: "rdmx6-jaaaa-aaaaa-aaadq-cai",
    metaLabel: "Canister ID",
    title: "Creating canister",
  },
  {
    completedDescription: "Storage module installed on the canister.",
    id: "wasm",
    status: "completed",
    title: "Installing storage module",
  },
  {
    description: "Publish the user interface assets.",
    error:
      "Upload stalled. The canister is safe, but the interface is not live yet.",
    id: "frontend",
    status: "error",
    title: "Uploading interface",
  },
  {
    id: "finalize",
    status: "pending",
    title: "Finalizing access",
  },
];

@Component({
  selector: "app-demo-page",
  imports: [
    NgIcon,
    RouterLink,
    OnboardingChecklistComponent,
    CopyToClipboardComponent,
    WalletNetworksViewComponent,
    RbthFrameComponent,
    RbthFrameDescriptionDirective,
    RbthFrameFooterDirective,
    RbthFrameHeaderDirective,
    RbthFramePanelDirective,
    RbthFrameTitleDirective,
    RbthStepComponent,
    RbthStepMetaDirective,
    RbthStepProgressDirective,
    RbthStepsComponent,
    RbthStepsDescriptionDirective,
    RbthStepsFooterDirective,
    RbthStepsHeaderDirective,
    RbthStepsTitleDirective,
    ...HlmButtonImports,
  ],
  providers: [provideIcons({ lucideRotateCcw })],
  template: `
    <div class="min-h-dvh bg-background p-8">
      <div class="mx-auto max-w-4xl space-y-8">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold tracking-tight">Component Demo</h1>
            <p class="text-muted-foreground">Preview of UI components</p>
          </div>
          <a hlmBtn variant="outline" routerLink="/"> Back to Home </a>
        </div>

        <!-- Frame Demo -->
        <section class="space-y-6">
          <h2 class="text-lg font-semibold">Frame Component</h2>

          <div class="grid gap-6 md:grid-cols-2">
            <!-- 1) Header, Panel, Footer -->
            <div class="space-y-2">
              <h3 class="text-sm font-medium text-muted-foreground">
                Header + Panel + Footer
              </h3>
              <rbth-frame>
                <header rbthFrameHeader>
                  <div rbthFrameTitle>Account Settings</div>
                  <div rbthFrameDescription>
                    Manage your account preferences
                  </div>
                </header>
                <div rbthFramePanel>
                  <div class="text-sm text-muted-foreground">
                    Configure your personal information and how others see you
                    on the platform.
                  </div>
                </div>
                <footer rbthFrameFooter class="flex justify-end gap-2">
                  <button hlmBtn variant="outline" size="sm">Cancel</button>
                  <button hlmBtn size="sm">Save</button>
                </footer>
              </rbth-frame>
            </div>

            <!-- 2) Header, Panel -->
            <div class="space-y-2">
              <h3 class="text-sm font-medium text-muted-foreground">
                Header + Panel
              </h3>
              <rbth-frame>
                <header rbthFrameHeader>
                  <div rbthFrameTitle>Notifications</div>
                  <div rbthFrameDescription>
                    Email and push notification preferences
                  </div>
                </header>
                <div rbthFramePanel>
                  <div class="text-sm text-muted-foreground">
                    Choose what updates you want to receive and how often.
                  </div>
                </div>
              </rbth-frame>
            </div>

            <!-- 3) Header, Panel, Panel -->
            <div class="space-y-2">
              <h3 class="text-sm font-medium text-muted-foreground">
                Header + Panel + Panel
              </h3>
              <rbth-frame>
                <header rbthFrameHeader>
                  <div rbthFrameTitle>Profile</div>
                  <div rbthFrameDescription>
                    Your public profile information
                  </div>
                </header>
                <div rbthFramePanel>
                  <div class="text-sm text-muted-foreground">
                    Update your avatar, display name, and bio.
                  </div>
                </div>
                <div rbthFramePanel>
                  <div class="text-sm text-muted-foreground">
                    Your profile is visible to all users on the platform.
                  </div>
                </div>
              </rbth-frame>
            </div>

            <!-- 4) Panel, Footer -->
            <div class="space-y-2">
              <h3 class="text-sm font-medium text-muted-foreground">
                Panel + Footer
              </h3>
              <rbth-frame>
                <div rbthFramePanel>
                  <div class="text-sm text-muted-foreground">
                    Are you sure you want to delete this storage? This action
                    cannot be undone.
                  </div>
                </div>
                <footer rbthFrameFooter class="flex justify-end gap-2">
                  <button hlmBtn variant="outline" size="sm">Cancel</button>
                  <button hlmBtn variant="destructive" size="sm">Delete</button>
                </footer>
              </rbth-frame>
            </div>

            <!-- 5) Panel, Panel -->
            <div class="space-y-2">
              <h3 class="text-sm font-medium text-muted-foreground">
                Panel + Panel
              </h3>
              <rbth-frame>
                <div rbthFramePanel>
                  <div class="text-sm font-medium">Security</div>
                  <div class="mt-1 text-sm text-muted-foreground">
                    Password and two-factor authentication settings.
                  </div>
                </div>
                <div rbthFramePanel>
                  <div class="text-sm font-medium">Privacy</div>
                  <div class="mt-1 text-sm text-muted-foreground">
                    Control who can see your activity and files.
                  </div>
                </div>
              </rbth-frame>
            </div>

            <!-- 6) Panel -->
            <div class="space-y-2">
              <h3 class="text-sm font-medium text-muted-foreground">Panel</h3>
              <rbth-frame>
                <div rbthFramePanel class="flex items-center gap-3">
                  <div
                    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                  >
                    <span class="text-lg">+</span>
                  </div>
                  <div>
                    <div class="text-sm font-medium">Add new storage</div>
                    <div class="text-xs text-muted-foreground">
                      Create an encrypted canister on the IC
                    </div>
                  </div>
                </div>
              </rbth-frame>
            </div>
          </div>
        </section>

        <!-- Process Steps Demo -->
        <section class="space-y-4">
          <h2 class="text-lg font-semibold">
            Process Steps (Canister Deployment)
          </h2>
          <div class="flex justify-center rounded-lg border bg-muted/50 p-8">
            <div class="w-full max-w-lg">
              <rbth-steps>
                <div rbthStepsHeader>
                  <div rbthStepsTitle class="text-balance text-foreground">
                    Deploying User Storage Canister
                  </div>
                  <div rbthStepsDescription class="text-xs">
                    {{ processHeaderStatusLabel() }}
                  </div>
                </div>

                @for (step of processSteps(); track step.id) {
                  <rbth-step [step]="step">
                    @if (step.id === "canister") {
                      <ng-template rbthStepMeta let-step>
                        @if (step.meta) {
                          <div class="flex items-center gap-2">
                            <span class="text-muted-foreground">
                              {{ step.metaLabel || "Details" }}:
                            </span>
                            <core-copy-to-clipboard [content]="step.meta">
                              {{ step.meta }}
                            </core-copy-to-clipboard>
                          </div>
                        }
                      </ng-template>
                    }

                    @if (step.id === "wasm" || step.id === "frontend") {
                      <ng-template
                        rbthStepProgress
                        let-step
                        let-percent="percent"
                      >
                        <div class="flex items-center justify-between gap-3">
                          <p class="text-xs text-muted-foreground">
                            {{ step.progress?.current }} /
                            {{ step.progress?.total }} processed
                          </p>
                          <p
                            class="text-xs font-medium text-foreground tabular-nums"
                          >
                            {{ percent }}%
                          </p>
                        </div>
                      </ng-template>
                    }
                  </rbth-step>
                }

                @if (processErrorStep(); as step) {
                  @if (step.error) {
                    <div
                      rbthStepsFooter
                      class="flex items-center justify-between gap-3"
                    >
                      <p class="text-xs leading-relaxed text-destructive">
                        {{ step.error }}
                      </p>
                      <button
                        hlmBtn
                        variant="destructive"
                        class="shrink-0"
                        (click)="onRetry(step)"
                      >
                        <ng-icon name="lucideRotateCcw" class="mr-1" />
                        Retry
                      </button>
                    </div>
                  }
                }
              </rbth-steps>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              hlmBtn
              variant="outline"
              size="sm"
              (click)="advanceProgress()"
            >
              Advance Progress
            </button>
            <button
              hlmBtn
              variant="outline"
              size="sm"
              (click)="advanceProcess()"
            >
              Complete Stage
            </button>
            <button hlmBtn variant="outline" size="sm" (click)="showError()">
              Trigger Upload Error
            </button>
            <button hlmBtn variant="outline" size="sm" (click)="resetProcess()">
              Reset
            </button>
          </div>
        </section>

        <!-- Onboarding Checklist Demo -->
        <section class="space-y-4">
          <h2 class="text-lg font-semibold">Onboarding Checklist</h2>
          <div class="flex justify-center rounded-lg border bg-muted/50 p-8">
            <rbth-onboarding-checklist
              title="Get started with Rabbithole"
              [steps]="onboardingSteps()"
              [(dismissed)]="isDismissed"
              (stepCompleted)="onStepCompleted($event)"
              (feedbackClicked)="onFeedbackClicked()"
            />
          </div>
        </section>

        <!-- Wallet Balances Demo -->
        <section class="space-y-4">
          <h2 class="text-lg font-semibold">Multi-chain Wallet Balances</h2>
          <rbth-frame>
            <header rbthFrameHeader>
              <div rbthFrameTitle>Wallet Balances</div>
              <div rbthFrameDescription>
                Manage deposit addresses and balances across IC, Base and Solana.
              </div>
            </header>

            <div rbthFramePanel>
              <core-wallet-networks-view />
            </div>
          </rbth-frame>
        </section>

        <!-- Event Log -->
        <section class="space-y-4">
          <h2 class="text-lg font-semibold">Event Log</h2>
          <div class="rounded-lg border bg-card p-4">
            @if (eventLog().length === 0) {
              <p class="text-sm text-muted-foreground">
                Interact with the components to see events here...
              </p>
            } @else {
              <ul class="space-y-1 font-mono text-sm">
                @for (event of eventLog(); track $index) {
                  <li class="text-muted-foreground">{{ event }}</li>
                }
              </ul>
            }
          </div>
          @if (eventLog().length > 0) {
            <button hlmBtn variant="outline" size="sm" (click)="clearLog()">
              Clear Log
            </button>
          }
        </section>
      </div>
    </div>
  `,
  host: { class: "block" },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoComponent {
  readonly eventLog = signal<string[]>([]);

  readonly isDismissed = signal(false);

  readonly onboardingSteps = signal<OnboardingStep[]>([
    ...DEMO_ONBOARDING_STEPS,
  ]);

  readonly processSteps = signal<ProcessStep[]>([...DEMO_PROCESS_STEPS]);

  readonly processErrorStep = computed(
    () => this.processSteps().find((step) => step.status === "error") ?? null,
  );

  readonly processHeaderStatusLabel = computed(() => {
    const steps = this.processSteps();
    const total = steps.length;
    const completed = steps.filter(
      (step) => step.status === "completed",
    ).length;
    const hasError = steps.some((step) => step.status === "error");

    if (hasError) {
      return `Step ${Math.min(completed + 1, total)} of ${total}`;
    }

    if (completed === total) {
      return `Completed ${total} of ${total} steps`;
    }

    return `Step ${completed + 1} of ${total}`;
  });

  advanceProcess(): void {
    const steps = this.processSteps();
    const inProgressIndex = steps.findIndex((s) => s.status === "in-progress");

    if (inProgressIndex === -1) return;

    const updated = steps.map((step, i) => {
      if (i === inProgressIndex) {
        return {
          ...step,
          status: "completed" as ProcessStepStatus,
          progress: undefined,
        };
      }
      if (i === inProgressIndex + 1 && step.status === "pending") {
        return {
          ...step,
          status: "in-progress" as ProcessStepStatus,
          progress:
            step.id === "frontend" ? { current: 1, total: 12 } : undefined,
        };
      }
      return step;
    });

    this.processSteps.set(updated);
    this.#addLog(`Step completed: "${steps[inProgressIndex].title}"`);
  }

  advanceProgress(): void {
    const steps = this.processSteps();
    const inProgressIndex = steps.findIndex((s) => s.status === "in-progress");

    if (inProgressIndex === -1) return;

    const step = steps[inProgressIndex];
    if (!step.progress) {
      this.advanceProcess();
      return;
    }

    const nextCurrent = Math.min(
      step.progress.current + 1,
      step.progress.total,
    );
    const updatedStep: ProcessStep = {
      ...step,
      progress: {
        ...step.progress,
        current: nextCurrent,
      },
    };

    const updated = steps.map((item, index) =>
      index === inProgressIndex ? updatedStep : item,
    );

    this.processSteps.set(updated);
    this.#addLog(
      `Progress updated: "${step.title}" ${nextCurrent}/${step.progress.total}`,
    );

    if (nextCurrent === step.progress.total) {
      this.advanceProcess();
    }
  }

  clearLog(): void {
    this.eventLog.set([]);
  }

  onFeedbackClicked(): void {
    this.#addLog("Feedback button clicked");
  }

  onRetry(step: ProcessStep): void {
    this.#addLog(`Retry clicked for: "${step.title}"`);
    this.processSteps.set([
      {
        completedDescription: "Canister created successfully.",
        description:
          "Create the user's storage canister on the Internet Computer.",
        id: "canister",
        meta: "rdmx6-jaaaa-aaaaa-aaadq-cai",
        metaLabel: "Canister ID",
        status: "completed",
        title: "Creating canister",
      },
      {
        completedDescription: "Storage module installed on the canister.",
        description: "Install the encrypted storage module.",
        id: "wasm",
        status: "completed",
        title: "Installing storage module",
      },
      {
        completedDescription: "Interface uploaded and ready to load.",
        description: "Publish the user interface assets.",
        id: "frontend",
        progress: { current: 1, total: 12 },
        status: "in-progress",
        title: "Uploading interface",
      },
      {
        completedDescription:
          "Temporary installer access removed and control returned to you.",
        description:
          "Return full control to the user and remove temporary installer access.",
        id: "finalize",
        status: "pending",
        title: "Finalizing access",
      },
    ]);
  }

  onStepCompleted(step: OnboardingStep): void {
    this.#addLog(`Onboarding step completed: "${step.title}"`);
  }

  resetProcess(): void {
    this.processSteps.set([...DEMO_PROCESS_STEPS]);
    this.#addLog("Process reset");
  }

  showError(): void {
    this.processSteps.set([...DEMO_PROCESS_ERROR]);
    this.#addLog("Showing error state");
  }

  #addLog(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.eventLog.update((log) => [`[${timestamp}] ${message}`, ...log]);
  }
}
