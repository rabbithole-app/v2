import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BrnDialogContent } from '@spartan-ng/brain/dialog';
import { BrnSelectImports } from '@spartan-ng/brain/select';
import { isNonNull, isNonNullish } from 'remeda';

import type {
  CreateStorageAccessGrants,
  StoragePermission,
} from '@rabbithole/encrypted-storage';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmDialog,
  HlmDialogContent,
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmSelectImports } from '@spartan-ng/helm/select';

import { principalValidator } from '../../../validators';
import {
  UserTarget,
  UserTargetComboboxComponent,
} from '../../users/user-target-combobox/user-target-combobox.component';

@Component({
  selector: 'core-edit-permission-form',
  templateUrl: './edit-permission-form.html',
  imports: [
    BrnDialogContent,
    HlmDialog,
    HlmDialogContent,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    HlmLabel,
    HlmInput,
    HlmButton,
    BrnSelectImports,
    HlmSelectImports,
    ReactiveFormsModule,
    UserTargetComboboxComponent,
  ],
})
export class EditPermissionFormComponent {
  accessGrantsChange = output<CreateStorageAccessGrants>();
  #fb = inject(FormBuilder);
  userControl = this.#fb.control<string | null>(null, {
    validators: [Validators.required, principalValidator],
  });
  form = this.#fb.nonNullable.group({
    user: this.userControl,
    permission: this.#fb.control<StoragePermission>('Read', {
      validators: [Validators.required],
    }),
  });
  principal = input<string>();
  isEditMode = computed(() => isNonNullish(this.principal()));
  readonly selectedUsers = signal<UserTarget[]>([]);
  canSubmit = computed(() => {
    if (this.form.controls.permission.invalid) return false;
    return this.isEditMode()
      ? this.userControl.valid
      : this.selectedUsers().length > 0;
  });
  dialog = viewChild.required(HlmDialog);
  permission = input<StoragePermission>();
  readonly permissions = [
    { value: 'Read', label: 'Read', description: 'Permission to read' },
    {
      value: 'ReadWrite',
      label: 'ReadWrite',
      description: 'Permission to modify',
    },
    {
      value: 'ReadWriteManage',
      label: 'ReadWriteManage',
      description: 'Rights to modify the permissions of other identities',
    },
  ];

  constructor() {
    effect(() => {
      const user = this.principal() ?? null;
      const permission = this.permission() ?? 'Read';
      this.form.patchValue({ user, permission });
      if (user) {
        this.selectedUsers.set([
          {
            kind: 'principal',
            principalId: user,
            label: this.shortPrincipal(user),
          },
        ]);
      } else {
        this.selectedUsers.set([]);
      }
    });
  }

  handleSubmit() {
    const { user, permission } = this.form.getRawValue();

    if (!isNonNull(permission)) return;

    if (this.isEditMode()) {
      if (isNonNull(user)) {
        this.accessGrantsChange.emit({
          items: [{ target: { principal: user }, permission }],
        });
      }
    } else if (this.selectedUsers().length > 0) {
      this.accessGrantsChange.emit({
        items: this.selectedUsers().map((target) => ({
          target: target.kind === 'email'
            ? { email: target.email }
            : { principal: target.principalId },
          permission,
        })),
      });
    }

    if (!this.isEditMode()) {
      this.selectedUsers.set([]);
      this.form.patchValue({ user: null, permission: 'Read' });
    }

    this.dialog().close();
  }

  handleUsersChange(targets: UserTarget[] | null): void {
    const selected = targets ?? [];
    this.selectedUsers.set(selected);
    const principalTarget = selected.find((target) => target.kind !== 'email');
    this.userControl.setValue(principalTarget?.principalId ?? null);
    this.userControl.markAsTouched();
  }

  private shortPrincipal(principalId: string): string {
    return principalId.length > 18
      ? `${principalId.slice(0, 8)}...${principalId.slice(-6)}`
      : principalId;
  }
}
