import type { BooleanInput } from '@angular/cdk/coercion';
import {
	booleanAttribute,
	ChangeDetectionStrategy,
	Component,
	computed,
	forwardRef,
	inject,
	input,
	linkedSignal,
	model,
	output,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown } from '@ng-icons/lucide';
import { BrnFieldControl, provideBrnLabelable } from '@spartan-ng/brain/field';
import { type ChangeFn, type TouchFn } from '@spartan-ng/brain/forms';
import type { ClassValue } from 'clsx';

import { classes, hlm } from '@spartan-ng/helm/utils';

export const HLM_NATIVE_SELECT_VALUE_ACCESSOR = {
	provide: NG_VALUE_ACCESSOR,
	useExisting: forwardRef(() => HlmNativeSelect),
	multi: true,
};

@Component({
	selector: 'hlm-native-select',
	imports: [NgIcon],
	providers: [
		HLM_NATIVE_SELECT_VALUE_ACCESSOR,
		provideIcons({ lucideChevronDown }),
		provideBrnLabelable(HlmNativeSelect),
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
	hostDirectives: [BrnFieldControl],
	host: {
		'data-slot': 'native-select-wrapper',
		'[attr.data-size]': 'size()',
	},
	template: `
		<select
			data-slot="native-select"
			[id]="selectId()"
			[class]="_computedSelectClass()"
			[attr.data-size]="size()"
			[attr.aria-invalid]="_ariaInvalid() ? 'true' : null"
			[attr.data-invalid]="_ariaInvalid() ? 'true' : null"
			[attr.data-dirty]="_dirty?.() ? 'true' : null"
			[attr.data-touched]="_touched?.() ? 'true' : null"
			[attr.data-matches-spartan-invalid]="_spartanInvalid?.() ? 'true' : null"
			[value]="value()"
			[disabled]="_disabled()"
			(change)="_valueChanged($event)"
			(blur)="_blur()"
		>
			<ng-content />
		</select>

		<ng-icon
			name="lucideChevronDown"
			[class]="_computedSelectIconClass()"
			aria-hidden="true"
			data-slot="native-select-icon"
		/>
	`,
})
export class HlmNativeSelect implements ControlValueAccessor {
	private static _id = 0;

	/** Manual override for aria-invalid. When not set, auto-detects from the parent autocomplete error state. */
	public readonly ariaInvalidOverride = input<boolean | undefined, BooleanInput>(undefined, {
		transform: (v: BooleanInput) => (v === '' || v === undefined ? undefined : booleanAttribute(v)),
		alias: 'aria-invalid',
	});

	public readonly disabled = input<boolean, BooleanInput>(false, { transform: booleanAttribute });

	public readonly selectId = input<string>(`hlm-native-select-${HlmNativeSelect._id++}`);

	public readonly labelableId = this.selectId;

	public readonly selectClass = input<ClassValue>('');

	public readonly selectIconClass = input<ClassValue>('');

	public readonly size = input<'default' | 'sm'>('default');

	public readonly value = model<string | null>('');

	public readonly valueChange = output<string | null>();

	private readonly _fieldControl = inject(BrnFieldControl, { optional: true });

	protected readonly _invalid = this._fieldControl?.invalid;

	protected readonly _ariaInvalid = computed(() => this.ariaInvalidOverride() ?? this._invalid?.());

	protected readonly _computedSelectClass = computed(() =>
		hlm(
			'border-input placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 dark:hover:bg-input/50 focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full min-w-0 appearance-none rounded-md border bg-transparent py-1 pr-8 pl-2.5 text-sm shadow-xs transition-[color,box-shadow] outline-none select-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed data-[size=sm]:h-8',
			'data-[matches-spartan-invalid=true]:ring-destructive/20 dark:data-[matches-spartan-invalid=true]:ring-destructive/40 data-[matches-spartan-invalid=true]:border-destructive dark:data-[matches-spartan-invalid=true]:border-destructive/50 data-[matches-spartan-invalid=true]:ring-3',
			this.selectClass(),
		),
	);

	protected readonly _computedSelectIconClass = computed(() =>
		hlm(
			'text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-base select-none',
			this.selectIconClass(),
		),
	);
	protected readonly _dirty = this._fieldControl?.dirty;

	protected readonly _disabled = linkedSignal(this.disabled);

	protected _onChange?: ChangeFn<string | null>;
	protected _onTouched?: TouchFn;
	protected readonly _spartanInvalid = this._fieldControl?.spartanInvalid;
	protected readonly _touched = this._fieldControl?.touched;

	constructor() {
		classes(() => 'group/native-select relative w-fit has-[select:disabled]:opacity-50');
	}

	public registerOnChange(fn: ChangeFn<string | null>): void {
		this._onChange = fn;
	}

	public registerOnTouched(fn: TouchFn): void {
		this._onTouched = fn;
	}

	public setDisabledState(isDisabled: boolean): void {
		this._disabled.set(isDisabled);
	}

	/** CONTROL VALUE ACCESSOR */
	public writeValue(value: string | null): void {
		this.value.set(value);
	}

	protected _blur(): void {
		this._onTouched?.();
	}

	protected _valueChanged(event: Event): void {
		const value = (event.target as HTMLSelectElement).value;
		this.value.set(value);
		this.valueChange.emit(value);
		this._onChange?.(value);
		this._onTouched?.();
	}
}
