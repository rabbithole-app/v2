import {
  ChangeDetectionStrategy,
  Component,
  inject,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucidePlus } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { toast } from 'ngx-sonner';

import {
  AddAllowanceData,
  AddAllowanceDialogComponent,
} from '../../components/add-allowance-dialog/add-allowance-dialog.component';
import { AllowancesTableComponent } from '../../components/allowances-table/allowances-table.component';
import { RevokeAllowanceDialogComponent } from '../../components/revoke-allowance-dialog/revoke-allowance-dialog.component';
import {
  ICPLedgerService,
  parseCanisterRejectError,
  provideLedgerActorWithAllowances,
} from '@rabbithole/core';

@Component({
  selector: 'rbth-feat-allowances-page',
  imports: [
    NgIcon,
    HlmIcon,
    HlmButton,
    HlmSpinner,
    ...HlmDropdownMenuImports,
    AllowancesTableComponent,
  ],
  providers: [
    ICPLedgerService,
    provideLedgerActorWithAllowances(),
    provideIcons({ lucidePlus, lucideChevronDown }),
  ],
  templateUrl: './allowances-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'w-full space-y-4 p-6',
  },
})
export class AllowancesPageComponent {
  #ledgerService = inject(ICPLedgerService);

  protected readonly _allowances = resource({
    loader: async () => {
      return await this.#ledgerService.getAllowances();
    },
  });

  protected readonly _isSubmitting = signal(false);
  protected readonly _tableComponent =
    viewChild.required(AllowancesTableComponent);

  #dialogService = inject(HlmDialogService);

  protected _onAddAllowance() {
    const dialogRef = this.#dialogService.open(AddAllowanceDialogComponent, {
      context: {},
    });

    dialogRef.closed$.subscribe((data: AddAllowanceData | undefined) => {
      if (data) {
        this._handleApprove(data);
      }
    });
  }

  protected _onEditAllowance(fromAccountId: string, toSpenderId: string) {
    // Find the allowance to edit
    const allowances = this._allowances.value() ?? [];
    const allowanceToEdit = allowances.find(
      (a) =>
        a.fromAccountId === fromAccountId && a.toSpenderId === toSpenderId,
    );

    if (!allowanceToEdit) {
      console.error('Allowance not found for editing');
      return;
    }

    // Open dialog with existing values
    const dialogRef = this.#dialogService.open(AddAllowanceDialogComponent, {
      context: {
        spenderId: allowanceToEdit.toSpenderId,
        amount: allowanceToEdit.allowance,
        expiresAt: allowanceToEdit.expiresAt,
      },
    });

    dialogRef.closed$.subscribe((data: AddAllowanceData | undefined) => {
      if (data) {
        this._handleApprove(data);
      }
    });
  }

  protected _onRevokeAllowance(fromAccountId: string, toSpenderId: string) {
    // Open confirmation dialog
    const dialogRef = this.#dialogService.open(RevokeAllowanceDialogComponent, {
      context: {},
    });

    dialogRef.closed$.subscribe(async (confirmed: boolean | undefined) => {
      if (!confirmed) return;

      this._isSubmitting.set(true);
      const toastId = toast.loading('Revoking allowance...');

      try {
        const blockIndex = await this.#ledgerService.removeApproval(
          toSpenderId,
        );

        toast.success(`Allowance revoked at block index: ${blockIndex}`, {
          id: toastId,
        });

        // Reload allowances list
        this._allowances.reload();
      } catch (error) {
        const errorMessage =
          parseCanisterRejectError(error) ?? 'An error has occurred';
        toast.error(`Failed to revoke allowance: ${errorMessage}`, {
          id: toastId,
        });
        console.error('Failed to revoke allowance:', error);
      } finally {
        this._isSubmitting.set(false);
      }
    });
  }

  private async _handleApprove(data: AddAllowanceData) {
    this._isSubmitting.set(true);
    const toastId = toast.loading('Approving allowance...');

    try {
      const blockIndex = await this.#ledgerService.approve(
        data.spenderId,
        data.amount,
        data.expiresAt,
      );

      toast.success(`Allowance approved at block index: ${blockIndex}`, {
        id: toastId,
      });

      // Reload allowances list
      this._allowances.reload();
    } catch (error) {
      const errorMessage =
        parseCanisterRejectError(error) ?? 'An error has occurred';
      toast.error(`Failed to approve allowance: ${errorMessage}`, {
        id: toastId,
      });
      console.error('Failed to approve allowance:', error);
    } finally {
      this._isSubmitting.set(false);
    }
  }
}
