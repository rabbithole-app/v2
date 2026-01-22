import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import { provideIcons } from '@ng-icons/core';
import { NgIcon as NgIconComponent } from '@ng-icons/core';
import { lucideMinus, lucidePlus } from '@ng-icons/lucide';

import {
  HlmInputGroup,
  HlmInputGroupImports,
} from '@spartan-ng/helm/input-group';

@Component({
  selector: 'rbth-feat-canisters-cycles-balance-input',
  imports: [
    FormsModule,
    HlmInputGroup,
    ...HlmInputGroupImports,
    NgIconComponent,
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CyclesBalanceInputComponent),
      multi: true,
    },
    provideIcons({
      lucidePlus,
      lucideMinus,
    }),
  ],
  template: `
    <hlm-input-group class="w-fit">
      <button
        hlmInputGroupButton
        type="button"
        [disabled]="disabled() || isMin()"
        (click)="_onDecrement()"
        size="icon-xs"
      >
        <ng-icon name="lucideMinus" />
      </button>
      <input
        hlmInputGroupInput
        type="number"
        [ngModel]="displayValue()"
        (ngModelChange)="_onValueChange($event)"
        [disabled]="disabled()"
        [min]="min()"
        [max]="max() ?? null"
        [step]="step()"
        class="w-24"
      />
      <button
        hlmInputGroupButton
        type="button"
        [disabled]="disabled() || isMax()"
        (click)="_onIncrement()"
        size="icon-xs"
      >
        <ng-icon name="lucidePlus" />
      </button>
    </hlm-input-group>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CyclesBalanceInputComponent implements ControlValueAccessor {
  readonly #disabled = signal(false);
  readonly disabled = computed(() => this.#disabled());
  readonly #value = signal(0);
  readonly displayValue = computed(() => {
    const value = this.#value();
    // Round to avoid floating point precision issues
    const decimals = this._getDecimals();
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  });
  readonly max = input<number | undefined>(undefined);

  readonly isMax = computed(() => {
    const maxValue = this.max();
    return maxValue !== undefined && this.#value() >= maxValue;
  });
  readonly min = input(0);

  readonly isMin = computed(() => this.#value() <= this.min());
  readonly step = input(1);

  // ControlValueAccessor implementation
  readonly touched = signal(false);

  constructor() {
    effect(() => {
      const value = this.#value();
      const minValue = this.min();
      const maxValue = this.max();

      // Clamp value to min/max bounds
      let clampedValue = value;
      if (value < minValue) {
        clampedValue = minValue;
      } else if (maxValue !== undefined && value > maxValue) {
        clampedValue = maxValue;
      }

      if (clampedValue !== value) {
        this.#value.set(clampedValue);
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
  onChanged = (value: number) => {};

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onTouched = () => {};

  registerOnChange(fn: (value: number) => void): void {
    this.onChanged = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.#disabled.set(isDisabled);
  }

  writeValue(value: number | null): void {
    this.#value.set(value ?? 0);
  }

  protected _onDecrement() {
    if (this.disabled() || this.isMin()) {
      return;
    }

    const step = this.step();
    const decimals = this._getDecimals();
    const newValue = this.#value() - step;
    const minValue = this.min();
    const finalValue = Math.max(newValue, minValue);
    // Round to avoid floating point precision issues
    const roundedValue =
      Math.round(finalValue * Math.pow(10, decimals)) / Math.pow(10, decimals);
    this.#value.set(roundedValue);
    this.onChanged(roundedValue);
    this.touched.set(true);
  }

  protected _onIncrement() {
    if (this.disabled() || this.isMax()) {
      return;
    }

    const step = this.step();
    const decimals = this._getDecimals();
    const newValue = this.#value() + step;
    const maxValue = this.max();
    const finalValue =
      maxValue !== undefined ? Math.min(newValue, maxValue) : newValue;
    // Round to avoid floating point precision issues
    const roundedValue =
      Math.round(finalValue * Math.pow(10, decimals)) / Math.pow(10, decimals);
    this.#value.set(roundedValue);
    this.onChanged(roundedValue);
    this.touched.set(true);
  }

  protected _onValueChange(value: number | string) {
    if (this.disabled()) {
      return;
    }

    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) {
      return;
    }

    const minValue = this.min();
    const maxValue = this.max();
    const decimals = this._getDecimals();

    let clampedValue = numValue;
    if (numValue < minValue) {
      clampedValue = minValue;
    } else if (maxValue !== undefined && numValue > maxValue) {
      clampedValue = maxValue;
    }

    // Round to avoid floating point precision issues
    const roundedValue =
      Math.round(clampedValue * Math.pow(10, decimals)) /
      Math.pow(10, decimals);
    this.#value.set(roundedValue);
    this.onChanged(roundedValue);
    this.touched.set(true);
  }

  private _getDecimals(): number {
    const step = this.step();
    const stepStr = step.toString();
    if (stepStr.includes('.')) {
      return stepStr.split('.')[1].length;
    }
    return 0;
  }
}
