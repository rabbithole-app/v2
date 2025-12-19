import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  ControlValueAccessor,
  FormBuilder,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { Principal } from '@icp-sdk/core/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideTriangleAlert } from '@ng-icons/lucide';
import {
  HlmInputGroup,
  HlmInputGroupImports,
} from '@spartan-ng/helm/input-group';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';
import { isNonNull } from 'remeda';

import { ControllerItemComponent } from './controller-item/controller-item.component';
import { principalValidator } from '@rabbithole/core';

@Component({
  selector: 'core-controllers-selector',
  imports: [
    ReactiveFormsModule,
    HlmInputGroup,
    ...HlmInputGroupImports,
    NgIcon,
    ControllerItemComponent,
    ...HlmTooltipImports,
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ControllersSelectorComponent),
      multi: true,
    },
    provideIcons({
      lucidePlus,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './controllers-selector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ControllersSelectorComponent implements ControlValueAccessor {
  readonly #fb = inject(FormBuilder);
  readonly controllerControl = this.#fb.control<string | null>(null, {
    validators: [principalValidator],
  });
  readonly #value = signal<Principal[]>([]);
  readonly controllers = computed(() => this.#value());

  readonly currentUserPrincipal = input.required<Principal>();
  readonly #disabled = signal(false);
  readonly disabled = computed(() => this.#disabled());
  readonly form = this.#fb.nonNullable.group({
    controller: this.controllerControl,
  });

  // ControlValueAccessor implementation
  readonly touched = signal(false);

  constructor() {
    effect(() => {
      const value = this.#value();
      // Ensure current user is always in the list
      const currentUser = this.currentUserPrincipal();
      if (
        value.length === 0 ||
        !value.some((p) => p.toText() === currentUser.toText())
      ) {
        const newValue = [
          currentUser,
          ...value.filter((p) => p.toText() !== currentUser.toText()),
        ];
        this.#value.set(newValue);
        this.onChanged(newValue);
      }
    });
  }

  isCurrentUser(principal: Principal): boolean {
    return principal.toText() === this.currentUserPrincipal().toText();
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
  onChanged = (value: Principal[]) => {};

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onTouched = () => {};

  registerOnChange(fn: (value: Principal[]) => void): void {
    this.onChanged = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.#disabled.set(isDisabled);
  }

  writeValue(value: Principal[] | null): void {
    const newValue = value ?? [];
    this.#value.set(newValue);
    // Sync with form control value
    this.onChanged(newValue);
  }

  protected _onAdd() {
    if (this.controllerControl.invalid || this.disabled()) {
      return;
    }

    const value = this.controllerControl.value;
    if (isNonNull(value)) {
      try {
        const principal = Principal.fromText(value);
        const currentControllers = this.#value();
        const principalText = principal.toText();

        // Check if already exists
        if (currentControllers.some((p) => p.toText() === principalText)) {
          return;
        }

        this.#value.set([...currentControllers, principal]);
        this.controllerControl.reset();
        this.onChanged(this.#value());
        this.touched.set(true);
      } catch {
        // Invalid principal, validator should catch this
      }
    }
  }

  protected _onRemove(principal: Principal) {
    if (this.disabled() || this.isCurrentUser(principal)) {
      return;
    }

    const currentControllers = this.#value();
    this.#value.set(
      currentControllers.filter((p) => p.toText() !== principal.toText()),
    );
    this.onChanged(this.#value());
    this.touched.set(true);
  }
}
