import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTrash2, lucideUserPen } from '@ng-icons/lucide';
import {
  BrnAlertDialogContent,
  BrnAlertDialogTrigger,
} from '@spartan-ng/brain/alert-dialog';
import { BrnDialog } from '@spartan-ng/brain/dialog';
import { CellContext, injectFlexRenderContext } from '@tanstack/angular-table';
import { ClassValue } from 'clsx';

import {
  CreateStorageAccessGrants,
  StoragePermission,
  StoragePermissionItem,
} from '@rabbithole/encrypted-storage';
import {
  HlmAlertDialog,
  HlmAlertDialogAction,
  HlmAlertDialogCancel,
  HlmAlertDialogContent,
  HlmAlertDialogDescription,
  HlmAlertDialogFooter,
  HlmAlertDialogHeader,
  HlmAlertDialogTitle,
} from '@spartan-ng/helm/alert-dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { hlm } from '@spartan-ng/helm/utils';

import { EditPermissionFormComponent } from '../edit-permission-form/edit-permission-form';
import { EditPermissionFormTriggerDirective } from '../edit-permission-form/edit-permission-form-trigger';

@Component({
  selector: 'rbth-core-actions-cell',
  imports: [
    HlmButton,
    NgIcon,
    HlmIcon,
    ...HlmTooltipImports,
    BrnAlertDialogTrigger,
    BrnAlertDialogContent,
    HlmAlertDialog,
    HlmAlertDialogHeader,
    HlmAlertDialogFooter,
    HlmAlertDialogTitle,
    HlmAlertDialogDescription,
    HlmAlertDialogCancel,
    HlmAlertDialogAction,
    HlmAlertDialogContent,
    EditPermissionFormComponent,
    EditPermissionFormTriggerDirective,
  ],
  providers: [provideIcons({ lucideUserPen, lucideTrash2 })],
  templateUrl: "./actions-cell.html",
  host: {
    '[class]': '_computedClass()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionsCellComponent {
  cancelPending = output<bigint>();
  dialogRef = viewChild.required(BrnDialog);
  edit = output<CreateStorageAccessGrants>();
  revoke = output();
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  get canEdit() {
    return this._context.row.original.targetKind === 'principal' && !this.isPending;
  }

  get grantId() {
    return this._context.row.original.grantId;
  }

  get isClaimedEmailInvite() {
    const item = this._context.row.original;
    return (
      item.targetKind !== 'principal' &&
      (item.claimedPrincipals?.length ?? 0) > 0
    );
  }

  get isPending() {
    return this._context.row.original.status === 'pending';
  }

  get permission() {
    return this._context.row.getValue<StoragePermission>('permission');
  }

  get principal() {
    return this._context.row.getValue<string>('user');
  }

  protected _computedClass = computed(() =>
    hlm('flex gap-1', this.userClass()),
  );

  private readonly _context =
    injectFlexRenderContext<CellContext<StoragePermissionItem, unknown>>();

  handleRevoke() {
    this.dialogRef().close();
    if (
      (this.isPending || this.isClaimedEmailInvite) &&
      this.grantId !== undefined
    ) {
      this.cancelPending.emit(this.grantId);
      return;
    }

    this.revoke.emit();
  }
}
