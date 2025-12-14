import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck } from '@ng-icons/lucide';
import { hlm } from '@spartan-ng/helm/utils';
import type { ClassValue } from 'clsx';

import { COLOR_KEYS, FOLDER_COLORS } from '../../constants';
import { DirectoryColor } from '../../types';

@Component({
  selector: 'rbth-feat-file-list-folder-color-picker',
  standalone: true,
  imports: [NgIcon],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => FolderColorPickerComponent),
      multi: true,
    },
    provideIcons({ lucideCheck }),
  ],
  template: `
    @let d = disabled();
    @for (color of colorKeys; track color) {
      <span
        role="button"
        [attr.tabindex]="d ? -1 : 0"
        [attr.aria-label]="'Select ' + color + ' color'"
        [attr.aria-pressed]="selectedColor() === color"
        [attr.aria-disabled]="d"
        [class.opacity-50]="d"
        [class.cursor-not-allowed]="d"
        [class.cursor-pointer]="!d"
        class="rounded-full transition-all relative flex items-center justify-center size-5 shrink-0 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        [style.background-color]="FOLDER_COLORS[color].cover"
        [style.border]="
          selectedColor() === color
            ? '2px solid ' + FOLDER_COLORS[color].back
            : 'none'
        "
        (click)="_onColorSelect(color)"
        (blur)="_onBlur()"
        (keydown.enter)="_onColorSelect(color)"
        (keydown.space)="_onColorSelect(color); $event.preventDefault()"
      >
        @if (selectedColor() === color) {
          <ng-icon name="lucideCheck" class="size-3! text-foreground!" />
        }
      </span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '_computedClass()',
  },
})
export class FolderColorPickerComponent implements ControlValueAccessor {
  readonly disabled = signal(false);

  readonly #value = signal<DirectoryColor>('blue');

  readonly selectedColor = computed(() => this.#value());
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    hlm('flex items-center gap-2 flex-wrap', this.userClass()),
  );
  protected readonly colorKeys = COLOR_KEYS;
  protected readonly FOLDER_COLORS = FOLDER_COLORS;

  readonly #touched = signal(false);
  // ControlValueAccessor implementation
  // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
  onChanged = (value: DirectoryColor) => {};

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onTouched = () => {};

  registerOnChange(fn: (value: DirectoryColor) => void): void {
    this.onChanged = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  // ControlValueAccessor methods
  writeValue(value: DirectoryColor | null): void {
    this.#value.set(value ?? 'blue');
  }

  protected _onBlur(): void {
    if (this.#touched()) {
      this.onTouched();
    }
  }

  protected _onColorSelect(color: DirectoryColor): void {
    if (this.disabled()) {
      return;
    }

    this.#value.set(color);
    this.onChanged(color);
    this.#touched.set(true);
  }
}
