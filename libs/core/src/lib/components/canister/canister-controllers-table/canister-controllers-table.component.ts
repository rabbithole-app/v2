import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Principal } from '@dfinity/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoader2, lucidePlus, lucideTrash2 } from '@ng-icons/lucide';
import { BrnSelectImports } from '@spartan-ng/brain/select';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTableImports } from '@spartan-ng/helm/table';
import {
  ColumnDef,
  createAngularTable,
  flexRenderComponent,
  FlexRenderDirective,
  getCoreRowModel,
  getPaginationRowModel,
  PaginationState,
} from '@tanstack/angular-table';

import { PrincipalCell } from '../../ui/tanstack/principal-cell';
import { AddControllerDialogComponent } from './add-controller-dialog.component';
import { RemoveControllerDialogComponent } from './remove-controller-dialog.component';

interface ControllerItem {
  principal: Principal;
}

@Component({
  selector: 'core-canister-controllers-table',
  imports: [
    FlexRenderDirective,
    FormsModule,
    NgIcon,
    HlmIcon,
    HlmButton,
    HlmSpinner,
    BrnSelectImports,
    HlmSelectImports,
    ...HlmTableImports,
  ],
  providers: [provideIcons({ lucidePlus, lucideTrash2, lucideLoader2 })],
  templateUrl: './canister-controllers-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'w-full space-y-4',
  },
})
export class CanisterControllersTableComponent {
  addController = output<Principal>();
  controllers = input<Principal[]>([]);
  currentPrincipalId = input<string>('');
  loadingState = input<{
    adding: string[];
    removing: string[];
  }>({
    adding: [],
    removing: [],
  });
  removeController = output<Principal>();

  protected readonly _availablePageSizes = [5, 10, 20, 10000];

  protected readonly _columns = computed<ColumnDef<ControllerItem>[]>(() => [
    {
      header: 'Principal ID',
      accessorFn: (row) => row.principal.toText(),
      id: 'principal',
      cell: ({ row }) =>
        flexRenderComponent(PrincipalCell, {
          inputs: {
            isBold:
              row.original.principal.toText() === this.currentPrincipalId(),
          },
        }),
    },
    {
      id: 'action',
      header: 'Actions',
      enableHiding: false,
      cell: ({ row }) => row.original.principal,
    },
  ]);

  protected readonly _isAdding = computed(() => {
    return this.loadingState().adding.length > 0;
  });

  protected get table(): ReturnType<typeof createAngularTable<ControllerItem>> {
    return this._table;
  }

  private readonly _controllersData = computed(() => {
    return this.controllers().map((principal) => ({
      principal,
    }));
  });

  private readonly _pagination = signal<PaginationState>({
    pageSize: 10,
    pageIndex: 0,
  });

  private readonly _table = createAngularTable<ControllerItem>(() => ({
    data: this._controllersData(),
    columns: this._columns(),
    state: {
      pagination: this._pagination(),
    },
    onPaginationChange: (updater) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      updater instanceof Function
        ? this._pagination.update(updater)
        : this._pagination.set(updater);
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  }));

  #dialogService = inject(HlmDialogService);

  protected _isCurrentPrincipal(principal: Principal) {
    return principal.toText() === this.currentPrincipalId();
  }

  protected _isRemoving(principal: Principal) {
    return this.loadingState().removing.includes(principal.toText());
  }

  protected _openAddDialog() {
    const dialogRef = this.#dialogService.open(AddControllerDialogComponent, {
      contentClass: 'min-w-[400px] sm:max-w-[425px]',
      context: {
        controllers: this.controllers(),
      },
    });

    dialogRef.closed$.subscribe((principal) => {
      if (principal) {
        this.addController.emit(principal);
      }
    });
  }

  protected _openRemoveDialog(principal: Principal) {
    const dialogRef = this.#dialogService.open(
      RemoveControllerDialogComponent,
      {
        context: {
          principal,
        },
      },
    );

    dialogRef.closed$.subscribe((confirmed) => {
      if (confirmed) {
        this.removeController.emit(principal);
      }
    });
  }
}
