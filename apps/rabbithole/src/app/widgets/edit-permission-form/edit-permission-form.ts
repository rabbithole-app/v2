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
import { BrnSelectModule } from '@spartan-ng/brain/select';
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
import { HlmSelectModule } from '@spartan-ng/helm/select';
import { isNonNull, isNonNullish } from 'remeda';

import { Permission } from '@rabbithole/assets';
import { ExtractVariantKeys, principalValidator } from '@rabbithole/core';

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
    BrnSelectModule,
    HlmSelectModule,
    ReactiveFormsModule,
  ],
})
export class EditPermissionFormComponent {
  dialog = viewChild.required(HlmDialog);
  #fb = inject(FormBuilder);
  principalControl = this.#fb.control<string | null>(null, {
    validators: [Validators.required, principalValidator],
  });
  form = this.#fb.nonNullable.group({
    principal: this.principalControl,
    permission: this.#fb.control<ExtractVariantKeys<Permission>>('Read', {
      validators: [Validators.required],
    }),
  });
  principal = input<string>();
  isEditMode = computed(() => isNonNullish(this.principal()));
  permission = input<ExtractVariantKeys<Permission>>();
  permissionChange = output<{
    permission: ExtractVariantKeys<Permission>;
    principal: string;
  }>();
  readonly permissions = [
    { value: 'Read', label: 'Read', description: 'Permission to read' },
    { value: 'Write', label: 'Write', description: 'Permission to modify' },
    {
      value: 'Permissions',
      label: 'Permissions',
      description: 'Rights to modify the permissions of other identities',
    },
    {
      value: 'Admin',
      label: 'Admin',
      description: 'Full administrative rights, including managing permissions',
    },
  ];

  constructor() {
    effect(() => {
      const principal = this.principal() ?? null;
      const permission = this.permission() ?? 'Read';
      this.form.patchValue({ principal, permission });
    });
  }

  handleSubmit() {
    const { principal, permission } = this.form.getRawValue();

    if (isNonNull(principal) && isNonNull(permission)) {
      this.permissionChange.emit({ principal, permission });
    }

    this.dialog().close();
  }
}
