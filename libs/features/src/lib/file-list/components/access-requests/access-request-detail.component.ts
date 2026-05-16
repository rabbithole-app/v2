import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideChevronLeft,
  lucideCircleAlert,
  lucideClock,
  lucideFile,
  lucideFolder,
  lucideHardDrive,
  lucideMessageSquareText,
  lucideRefreshCw,
  lucideSlash,
  lucideX,
} from '@ng-icons/lucide';
import { BrnSelectImports } from '@spartan-ng/brain/select';
import { map } from 'rxjs';

import { CoreTransparentSelectBackdropDirective } from '@rabbithole/core';
import type {
  Entry,
  StorageAccessRequest,
  StoragePermission,
  TreeNode,
} from '@rabbithole/encrypted-storage';
import { UserIdentityComponent } from '@rabbithole/ui';
import {
  RbthTreeSelectComponent,
  RbthTreeSelectTriggerDirective,
  RbthTreeSelectValue,
} from '@rabbithole/ui/tree-select';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import { AccessRequestsStore } from './access-requests.store';

@Component({
  selector: 'rbth-feat-access-request-detail',
  templateUrl: './access-request-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BrnSelectImports,
    CoreTransparentSelectBackdropDirective,
    ...HlmAlertImports,
    HlmBadge,
    HlmButton,
    ...HlmCardImports,
    ...HlmEmptyImports,
    ...HlmFieldImports,
    HlmIcon,
    HlmSelectImports,
    HlmSpinner,
    NgIcon,
    RbthTreeSelectComponent,
    RbthTreeSelectTriggerDirective,
    ReactiveFormsModule,
    RouterLink,
    UserIdentityComponent,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideChevronLeft,
      lucideCircleAlert,
      lucideClock,
      lucideFile,
      lucideFolder,
      lucideHardDrive,
      lucideMessageSquareText,
      lucideRefreshCw,
      lucideSlash,
      lucideX,
    }),
  ],
})
export class AccessRequestDetailComponent implements OnInit {
  readonly #fb = inject(FormBuilder);
  readonly form = this.#fb.nonNullable.group({
    permission: this.#fb.nonNullable.control<StoragePermission>('Read', {
      validators: [Validators.required],
    }),
  });
  readonly #route = inject(ActivatedRoute);
  readonly requestIdParam = toSignal(
    this.#route.paramMap.pipe(map((params) => params.get('requestId'))),
    { initialValue: null },
  );
  readonly requestId = computed(() => {
    const value = this.requestIdParam();
    if (!value) return null;
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  });
  readonly invalidRequestId = computed(
    () => this.requestIdParam() !== null && this.requestId() === null,
  );

  readonly store = inject(AccessRequestsStore);

  readonly request = computed(() => {
    const id = this.requestId();
    if (id === null) return null;
    return this.store.requests().find((request) => request.id === id) ?? null;
  });

  readonly selectedScope = signal<RbthTreeSelectValue | undefined>(undefined);

  constructor() {
    effect(() => {
      this.requestId();
      this.selectedScope.set(undefined);
    });
  }

  approve(request: StorageAccessRequest): void {
    const entry = this.#selectedEntry();
    if (entry === null) return;

    void this.store.resolve({
      decision: 'approved',
      entry,
      permission: this.form.controls.permission.value,
      requestId: request.id,
    });
  }

  canApprove(): boolean {
    return this.form.valid && this.#selectedEntry() !== null;
  }

  ngOnInit(): void {
    this.store.setTree(
      this.#route.snapshot.data['accessRequestTree'] as TreeNode[],
    );
  }

  permissionLabel(permission: StoragePermission): string {
    if (permission === 'Read') return 'View';
    if (permission === 'ReadWrite') return 'Edit';
    return 'Manage';
  }

  reject(request: StorageAccessRequest): void {
    void this.store.resolve({
      decision: 'rejected',
      requestId: request.id,
    });
  }

  scopeIcon(scope: RbthTreeSelectValue | undefined): string {
    if (!scope || scope.kind === 'root') return 'lucideHardDrive';
    return this.#isFolder(scope.node) ? 'lucideFolder' : 'lucideFile';
  }

  scopeLabel(
    scope: RbthTreeSelectValue | undefined,
    placeholder = 'Choose scope',
  ): string {
    if (!scope) return placeholder;
    if (scope.kind === 'root') return 'Whole storage';
    const prefix = this.#isFolder(scope.node) ? 'Folder' : 'File';
    return `${prefix}: ${scope.node.path ?? scope.node.name}`;
  }

  #isFolder(node: {
    children?: unknown;
    kind?: 'directory' | 'file';
  }): boolean {
    return node.kind === 'directory' || node.children !== undefined;
  }

  #selectedEntry(): Entry | null | undefined {
    const scope = this.selectedScope();
    if (!scope) return null;
    if (scope.kind === 'root') return undefined;

    return [
      this.#isFolder(scope.node) ? 'Directory' : 'File',
      scope.node.path ?? scope.node.name,
    ];
  }
}
