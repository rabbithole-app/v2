import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BrnDialogContent } from '@spartan-ng/brain/dialog';
import { BrnSelectImports } from '@spartan-ng/brain/select';
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
import { isNonNull, isNonNullish } from 'remeda';

import { principalValidator } from '@rabbithole/core';
import type {
  GrantStoragePermission,
  StoragePermission,
} from '@rabbithole/encrypted-storage';

@Component({
  selector: 'app-edit-permission-form',
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
  ],
})
export class EditPermissionFormComponent {
  dialog = viewChild.required(HlmDialog);
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
  permission = input<StoragePermission>();
  permissionChange = output<Omit<GrantStoragePermission, 'entry'>>();
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
    });
  }

  handleSubmit() {
    const { user, permission } = this.form.getRawValue();

    if (isNonNull(user) && isNonNull(permission)) {
      this.permissionChange.emit({ user, permission });
    }

    this.dialog().close();
  }
}
