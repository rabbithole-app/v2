import { FocusKeyManager } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  OnDestroy,
  output,
  Signal,
  signal,
  viewChildren,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideDownload,
  lucideFolderPlus,
  lucideFolderTree,
  lucideFolderUp,
  lucidePencil,
  lucideTrash2,
  lucideUpload,
} from '@ng-icons/lucide';
import type { ClassValue } from 'clsx';
import { NgClickOutsideDirective } from 'ng-click-outside2';
import * as R from 'remeda';

import { HlmContextMenuImports } from '@spartan-ng/helm/context-menu';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { hlm } from '@spartan-ng/helm/utils';

import { DirectoryColor, isDirectory, NodeItem } from '../../types';
import { FolderColorPickerComponent } from '../folder-color-picker/folder-color-picker.component';
import { GridItemComponent } from '../grid-item/grid-item.component';

const GRID_CELL_WIDTH = 102;
const GRID_CELL_COLUMN_GAP = 16;

@Component({
  selector: 'rbth-feat-file-list-grid-view',
  templateUrl: './grid-view.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GridItemComponent,
    HlmEmptyImports,
    HlmContextMenuImports,
    HlmFieldImports,
    HlmDropdownMenuImports,
    NgIcon,
    FolderColorPickerComponent,
    ReactiveFormsModule,
  ],
  providers: [
    provideIcons({
      lucideFolderPlus,
      lucideUpload,
      lucideFolderUp,
      lucideTrash2,
      lucideDownload,
      lucidePencil,
      lucideFolderTree,
    }),
  ],
  hostDirectives: [
    {
      directive: NgClickOutsideDirective,
      outputs: ['clickOutside'],
    },
  ],
  host: {
    '[class]': '_computedClass()',
    '[attr.role]': '"grid"',
    '[attr.aria-label]': '"File list grid"',
    '[attr.tabindex]': '0',
    '(keydown)': '_handleKeydown($event)',
    '(click)': '_handleHostClick($event)',
    '(clickOutside)': '_handleClickOutside($event)',
  },
})
export class GridViewComponent implements OnDestroy {
  items = input.required<NodeItem[]>();
  state = signal<{
    columns: number;
    everyDirectory: boolean;
    everyFile: boolean;
    selected: bigint[];
    someDirectory: boolean;
    someFile: boolean;
  }>({
    selected: [],
    columns: 0,
    everyDirectory: false,
    everyFile: false,
    someDirectory: false,
    someFile: false,
  });
  // Takes into account not only the change in the number of elements, but also the change in properties of any grid element
  // (reason why QueryList and its observable changes property are not used)
  chunkedGridItems: Signal<Array<bigint | null>[]> = computed(() =>
    R.pipe(
      this.items(),
      R.map((item) => (item.disabled ? null : item.id)),
      R.chunk(this.state().columns),
    ),
  );
  delete = output<bigint[]>();
  download = output<bigint[]>();
  folderColorControl = new FormControl<DirectoryColor>('blue');
  move = output<bigint[]>();
  rename = output<bigint[]>();

  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    hlm(
      'flex flex-wrap gap-4 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] rounded-lg',
      this.userClass(),
    ),
  );
  protected readonly gridListItems = viewChildren(GridItemComponent);
  #element = inject(ElementRef);
  #hostResizeObserver!: ResizeObserver;
  // Use linkedSignal with cleanup via previous.value
  readonly #keyManager = linkedSignal<
    readonly GridItemComponent[],
    FocusKeyManager<GridItemComponent> | undefined
  >({
    source: this.gridListItems,
    computation: (items, previous) => {
      // Cleanup previous keyManager
      const prevKeyManager = previous?.value;
      if (prevKeyManager) {
        prevKeyManager.destroy();
      }

      return items.length > 0
        ? new FocusKeyManager<GridItemComponent>(items)
            .withWrap()
            .skipPredicate((item) => {
              // Use items() to check disabled
              const itemData = this.items().find(
                (i) => i.id === item.data().id,
              );
              return !!itemData?.disabled;
            })
        : undefined;
    },
  });
  #route = inject(ActivatedRoute);
  #router = inject(Router);

  constructor() {
    this.#init();
  }

  _handleClickOutside(_event: Event) {
    // Clear selection when clicking outside the component
    this.state.update((state) => ({
      ...state,
      selected: [],
      everyDirectory: false,
      everyFile: false,
      someDirectory: false,
      someFile: false,
    }));
  }

  _handleHostClick(_event: MouseEvent) {
    // Clear selection when clicking on host (but not on items, as they use stopPropagation)
    this.state.update((state) => ({
      ...state,
      selected: [],
      everyDirectory: false,
      everyFile: false,
      someDirectory: false,
      someFile: false,
    }));
  }

  _handleItemAction(
    action: 'delete' | 'download' | 'move' | 'rename',
    selected: bigint[],
  ) {
    switch (action) {
      case 'delete':
        this.delete.emit(selected);
        break;
      case 'download':
        this.download.emit(selected);
        break;
      case 'move':
        this.move.emit(selected);
        break;
      case 'rename':
        this.rename.emit(selected);
        break;
    }
  }

  _handleItemClick(event: MouseEvent, { id }: NodeItem) {
    // Stop event propagation so host doesn't handle the click
    event.stopPropagation();

    const { button, shiftKey, ctrlKey, metaKey, which } = event;
    const selected = this.state().selected;

    switch (true) {
      case which === 3 || button === 2: {
        if (!selected.includes(id)) {
          this.state.update((state) => ({
            ...state,
            selected: [id],
            ...this.#prepareSelectedBooleans([id]),
          }));
        }

        break;
      }
      case shiftKey: {
        const index = this.items().findIndex(({ id: _id }) => _id === id);
        let start = 0;
        let end = index + 1;

        if (selected.length > 0) {
          const firstIndex = this.items().findIndex(({ id }) =>
            selected.includes(id),
          );
          const lastIndex = R.findLastIndex(this.items(), ({ id }) =>
            selected.includes(id),
          );

          if (index > lastIndex) {
            [start, end] = [lastIndex, index + 1];
          } else if (index < firstIndex) {
            [start, end] = [index, firstIndex + 1];
          } /*else if (index > firstIndex && index < lastIndex) {
                    [start, end] = [firstIndex, index + 1];
                } else if (index === firstIndex || index === lastIndex) {
                    [start, end] = [firstIndex, lastIndex + 1];
                }*/
        }

        const _selected = this.items()
          .slice(start, end) /*.filter(({ disabled }) => !disabled)*/
          .map(({ id }) => id);
        this.state.update((state) => ({
          ...state,
          selected: _selected,
          ...this.#prepareSelectedBooleans(_selected),
        }));
        break;
      }
      case ctrlKey || metaKey: {
        if (selected.includes(id)) {
          this.state.update((state) => {
            const newSelected = selected.filter((_id) => _id !== id);
            return {
              ...state,
              selected: newSelected,
              ...this.#prepareSelectedBooleans(newSelected),
            };
          });
        } else {
          this.state.update((state) => {
            const newSelected = [...state.selected, id];
            return {
              ...state,
              selected: newSelected,
              ...this.#prepareSelectedBooleans(newSelected),
            };
          });
        }
        break;
      }
      default: {
        this.state.update((state) => ({
          ...state,
          selected: [id],
          ...this.#prepareSelectedBooleans([id]),
        }));
      }
    }
  }

  _handleItemDblClick(_event: MouseEvent, item: NodeItem) {
    if (isDirectory(item)) {
      this.#router.navigate([item.name], { relativeTo: this.#route });
    }
  }

  _handleItemFocus(_event: FocusEvent, item: NodeItem) {
    const keyManager = this.#keyManager();
    if (!keyManager) {
      return;
    }

    const index = R.pipe(
      this.chunkedGridItems(),
      R.filter(R.isTruthy),
      R.flat(1),
      R.findIndex((id) => id === item.id),
    );

    if (index > -1) {
      keyManager.setActiveItem(index);
    }
  }

  _handleKeydown(event: KeyboardEvent): void {
    const keyManager = this.#keyManager();
    if (!keyManager) {
      return;
    }

    // Handle only arrow keys and control keys, don't block Tab
    const handledKeys = [
      'ArrowDown',
      'ArrowUp',
      'ArrowLeft',
      'ArrowRight',
      'Enter',
      'Escape',
      'Space',
    ];
    if (!handledKeys.includes(event.code)) {
      return; // Skip Tab and other keys
    }

    event.preventDefault();
    event.stopPropagation();

    const activeItemIndex = keyManager.activeItemIndex;
    const chunkedGridItems = this.chunkedGridItems();

    // Find current position in grid (rowIndex, columnIndex)
    let rowIndex = 0;
    let columnIndex = 0;
    if (R.isNumber(activeItemIndex) && activeItemIndex > -1) {
      const id = this.items()[activeItemIndex].id;
      rowIndex = R.findIndex(chunkedGridItems, (indexes) =>
        indexes.includes(id),
      );
      columnIndex = chunkedGridItems[rowIndex].indexOf(id);
    }

    switch (event.code) {
      case 'ArrowDown': {
        const index = R.pipe(
          R.drop(chunkedGridItems, rowIndex + 1),
          R.map((arr) => {
            const value = arr[columnIndex];
            return R.isBigInt(value) ? value : R.last(arr);
          }),
          R.filter(R.isTruthy),
          R.first,
          ($) =>
            R.findIndex(
              this.items(),
              (item) => item.id === ($ as unknown as bigint),
            ),
        );

        if (index > -1) {
          keyManager.setActiveItem(index);
        }

        break;
      }
      case 'ArrowLeft': {
        keyManager.setPreviousItemActive();
        break;
      }
      case 'ArrowRight': {
        keyManager.setNextItemActive();
        break;
      }
      case 'ArrowUp': {
        const index = R.pipe(
          R.dropLast(chunkedGridItems, chunkedGridItems.length - rowIndex),
          R.map((arr) => arr[columnIndex]),
          R.filter(R.isTruthy),
          R.last,
          ($) =>
            R.findIndex(
              this.items(),
              (item) => item.id === ($ as unknown as bigint),
            ),
        );

        if (index > -1) {
          keyManager.setActiveItem(index);
        }

        break;
      }
      case 'Enter': {
        // TODO: navigate to folder or open file
        break;
      }
      case 'Escape': {
        // TODO: navigate up one level from folder
        break;
      }
      case 'Space': {
        // TODO: select item
        break;
      }
      default:
      // this.keyManager.onKeydown(event);
    }
  }

  ngOnDestroy(): void {
    this.#hostResizeObserver.unobserve(this.#element.nativeElement);
    // linkedSignal will call cleanup when the component is destroyed
  }

  #init() {
    this.#hostResizeObserver = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      const columns = Math.floor(
        (width + GRID_CELL_COLUMN_GAP) /
          (GRID_CELL_WIDTH + GRID_CELL_COLUMN_GAP),
      );
      this.state.update((state) => ({ ...state, columns }));
    });
    this.#hostResizeObserver.observe(this.#element.nativeElement);
  }

  #prepareSelectedBooleans(selected: bigint[]) {
    const items = R.intersectionWith(
      this.items(),
      selected,
      (item, selectedId) => item.id === selectedId,
    );
    const everyDirectory = items.every(({ type }) => type === 'directory');
    const everyFile = items.every(({ type }) => type === 'file');
    const someDirectory = items.some(({ type }) => type === 'directory');
    const someFile = items.some(({ type }) => type === 'file');
    return { everyDirectory, everyFile, someDirectory, someFile };
  }
}
