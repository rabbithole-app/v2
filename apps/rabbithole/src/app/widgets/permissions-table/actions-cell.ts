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
import {
  HlmAlertDialog,
  HlmAlertDialogActionButton,
  HlmAlertDialogCancelButton,
  HlmAlertDialogContent,
  HlmAlertDialogDescription,
  HlmAlertDialogFooter,
  HlmAlertDialogHeader,
  HlmAlertDialogTitle,
} from '@spartan-ng/helm/alert-dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { hlm } from '@spartan-ng/helm/utils';
import { CellContext, injectFlexRenderContext } from '@tanstack/angular-table';
import { ClassValue } from 'clsx';

import { EditPermissionFormComponent } from '../edit-permission-form/edit-permission-form';
import { EditPermissionFormTriggerDirective } from '../edit-permission-form/edit-permission-form-trigger';
import {
  GrantPermission,
  Permission,
  PermissionItem,
} from '@rabbithole/encrypted-storage';
import { RbthTooltipTriggerDirective } from '@rabbithole/ui';

@Component({
  selector: 'app-actions-cell',
  imports: [
    HlmButton,
    NgIcon,
    HlmIcon,
    RbthTooltipTriggerDirective,
    BrnAlertDialogTrigger,
    BrnAlertDialogContent,
    HlmAlertDialog,
    HlmAlertDialogHeader,
    HlmAlertDialogFooter,
    HlmAlertDialogTitle,
    HlmAlertDialogDescription,
    HlmAlertDialogCancelButton,
    HlmAlertDialogActionButton,
    HlmAlertDialogContent,
    EditPermissionFormComponent,
    EditPermissionFormTriggerDirective,
  ],
  providers: [provideIcons({ lucideUserPen, lucideTrash2 })],
  template: `
    <app-edit-permission-form
      [principal]="principal"
      [permission]="permission"
      (permissionChange)="edit.emit($event)"
    >
      <button
        class="size-8"
        variant="ghost"
        size="icon"
        rbthTooltipTrigger="Edit permission"
        appEditPermissionFormTrigger
      >
        <ng-icon hlmIcon name="lucideUserPen" size="sm" />
        <span class="sr-only">Edit</span>
      </button>
    </app-edit-permission-form>
    <hlm-alert-dialog>
      <button
        class="size-8 text-destructive hover:text-destructive"
        hlmBtn
        variant="ghost"
        size="icon"
        rbthTooltipTrigger="Revoke permission"
        brnAlertDialogTrigger
      >
        <span class="sr-only">Revoke</span>
        <ng-icon hlmIcon size="sm" name="lucideTrash2" />
      </button>
      <hlm-alert-dialog-content *brnAlertDialogContent="let ctx">
        <hlm-alert-dialog-header>
          <h3 hlmAlertDialogTitle>Are you absolutely sure?</h3>
          <p hlmAlertDialogDescription>
            This action cannot be undone. This will permanently delete your
            account and remove your data from our servers.
          </p>
        </hlm-alert-dialog-header>
        <hlm-alert-dialog-footer>
          <button hlmAlertDialogCancel (click)="ctx.close()">Cancel</button>
          <button hlmAlertDialogAction (click)="handleRevoke()">
            Revoke permission
          </button>
        </hlm-alert-dialog-footer>
      </hlm-alert-dialog-content>
    </hlm-alert-dialog>
  `,
  host: {
    '[class]': '_computedClass()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionsCellComponent {
  dialogRef = viewChild.required(BrnDialog);
  edit = output<Omit<GrantPermission, 'entry'>>();
  revoke = output();
  readonly userClass = input<ClassValue>('', { alias: 'class' });

  get permission() {
    return this._context.row.getValue<Permission>('permission');
  }

  get principal() {
    return this._context.row.getValue<string>('principal');
  }

  protected _computedClass = computed(() =>
    hlm('flex gap-1', this.userClass()),
  );

  private readonly _context =
    injectFlexRenderContext<CellContext<PermissionItem, unknown>>();

  handleRevoke() {
    this.dialogRef().close();
    this.revoke.emit();
  }
}
