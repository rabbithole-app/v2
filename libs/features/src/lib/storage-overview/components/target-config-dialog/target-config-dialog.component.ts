import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideKeyRound } from '@ng-icons/lucide';
import type { BrnDialogState } from '@spartan-ng/brain/dialog';
import { toast } from '@spartan-ng/brain/sonner';

import type {
  ConfigureExternalStorageTargetArgs,
  ExternalStorageTargetView,
} from '@rabbithole/declarations/encrypted-storage';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmToggleGroupImports } from '@spartan-ng/helm/toggle-group';

import { ExternalStorageTargetsService } from '../../services/external-storage-targets.service';
import { s3Config, targetLabel } from '../../utils';

export type ConfigureMode = 'new' | 'rotate';

type S3TargetForm = FormGroup<{
  accessKeyId: FormControl<string>;
  bucket: FormControl<string>;
  displayName: FormControl<string>;
  endpoint: FormControl<string>;
  forcePathStyle: FormControl<boolean>;
  prefix: FormControl<string>;
  region: FormControl<string>;
  secretAccessKey: FormControl<string>;
  sessionToken: FormControl<string>;
}>;

const DEFAULT_REGION = 'us-east-1';

@Component({
  selector: 'rbth-feat-target-config-dialog',
  templateUrl: './target-config-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgIcon,
    HlmInput,
    HlmSpinner,
    ...HlmAlertImports,
    ...HlmButtonImports,
    ...HlmDialogImports,
    ...HlmFieldImports,
    ...HlmSwitchImports,
    ...HlmToggleGroupImports,
  ],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideKeyRound,
    }),
  ],
})
export class TargetConfigDialogComponent {
  protected readonly _form: S3TargetForm = new FormGroup({
    accessKeyId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    bucket: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[^/]+$/)],
    }),
    displayName: new FormControl('', { nonNullable: true }),
    endpoint: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/^https:\/\/[^/?#]+$/),
      ],
    }),
    forcePathStyle: new FormControl(true, { nonNullable: true }),
    prefix: new FormControl('', { nonNullable: true }),
    region: new FormControl(DEFAULT_REGION, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    secretAccessKey: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    sessionToken: new FormControl('', { nonNullable: true }),
  });

  protected readonly _mode = signal<ConfigureMode>('new');

  protected readonly _saving = signal(false);

  readonly #selectedTargetId = signal<string | null>(null);

  readonly #targets = inject(ExternalStorageTargetsService);

  protected readonly _selectedTarget = computed(() => {
    const selectedId = this.#selectedTargetId();
    return selectedId
      ? (this.#targets
          .targets()
          .find((target) => target.id === selectedId) ?? null)
      : null;
  });

  protected readonly _state = signal<BrnDialogState>('closed');

  protected readonly _submitError = signal<string | null>(null);

  protected readonly _submitted = signal(false);

  protected readonly _targets = this.#targets.targets;

  readonly #targetFieldsLocked = computed(
    () => this._mode() === 'rotate' && this._selectedTarget() !== null,
  );

  constructor() {
    effect(() => {
      this.#setPhysicalTargetControlsDisabled(this.#targetFieldsLocked());
    });
  }

  open(mode: ConfigureMode, target?: ExternalStorageTargetView): void {
    if (target) {
      this.#selectTarget(target);
    } else {
      this._setMode(mode);
    }
    this._state.set('open');
  }

  protected _controlInvalid(
    controlName: keyof S3TargetForm['controls'],
  ): boolean {
    const control = this._form.controls[controlName];
    return control.invalid && (control.touched || this._submitted());
  }

  protected _modeValueChanged(value: unknown): void {
    if (value === 'new' || value === 'rotate') {
      this._setMode(value);
    }
  }

  protected _setMode(mode: ConfigureMode): void {
    this._mode.set(mode);
    this._submitError.set(null);
    this._submitted.set(false);

    if (mode === 'new') {
      this.#resetNewTargetForm();
      return;
    }

    const target = this._selectedTarget() ?? this.#targets.activeTarget();
    if (target) {
      this.#selectTarget(target);
    }
  }

  protected _stateChanged(state: BrnDialogState): void {
    this._state.set(state);

    if (state === 'closed') {
      this._submitError.set(null);
      this._submitted.set(false);
    }
  }

  protected async _submit(): Promise<void> {
    this._submitted.set(true);
    this._submitError.set(null);

    if (this._form.invalid) {
      this._form.markAllAsTouched();
      return;
    }

    this._saving.set(true);

    try {
      const target = await this.#targets.configure(this.#formToArgs());
      this._submitted.set(false);
      this._form.controls.accessKeyId.reset('');
      this._form.controls.secretAccessKey.reset('');
      this._form.controls.sessionToken.reset('');
      this.#selectTarget(target);
      this._state.set('closed');
      toast.success(
        this._mode() === 'rotate'
          ? 'S3 credentials updated'
          : 'S3 target connected',
      );
    } catch (error) {
      const message = this.#targets.describeError(error);
      this._submitError.set(message);
      toast.error(message);
    } finally {
      this._saving.set(false);
    }
  }

  protected _targetLabel(target: ExternalStorageTargetView | null): string {
    return targetLabel(target);
  }

  #formToArgs(): ConfigureExternalStorageTargetArgs {
    const value = this._form.getRawValue();
    const displayName = value.displayName.trim();
    const sessionToken = value.sessionToken.trim();
    const selectedTargetId = this.#selectedTargetId();

    return {
      accessKeyId: value.accessKeyId.trim(),
      bucket: value.bucket.trim(),
      displayName: displayName ? [displayName] : [],
      endpoint: value.endpoint.trim(),
      forcePathStyle: value.forcePathStyle,
      prefix: value.prefix.trim(),
      region: value.region.trim(),
      secretAccessKey: value.secretAccessKey,
      sessionToken: sessionToken ? [sessionToken] : [],
      targetId:
        this._mode() === 'rotate' && selectedTargetId ? [selectedTargetId] : [],
    };
  }

  #patchFormFromTarget(target: ExternalStorageTargetView): void {
    const config = s3Config(target);
    this._form.patchValue(
      {
        bucket: config.bucket,
        displayName: target.displayName[0] ?? '',
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle,
        prefix: config.prefix,
        region: config.region,
      },
      { emitEvent: false },
    );
  }

  #resetNewTargetForm(): void {
    this.#selectedTargetId.set(null);
    this._form.reset(
      {
        accessKeyId: '',
        bucket: '',
        displayName: '',
        endpoint: '',
        forcePathStyle: true,
        prefix: '',
        region: DEFAULT_REGION,
        secretAccessKey: '',
        sessionToken: '',
      },
      { emitEvent: false },
    );
  }

  #selectTarget(target: ExternalStorageTargetView): void {
    this.#selectedTargetId.set(target.id);
    this._mode.set('rotate');
    this._submitError.set(null);
    this._submitted.set(false);
    this.#patchFormFromTarget(target);
  }

  #setPhysicalTargetControlsDisabled(disabled: boolean): void {
    const controls = [
      this._form.controls.endpoint,
      this._form.controls.bucket,
      this._form.controls.prefix,
    ];

    for (const control of controls) {
      if (disabled && control.enabled) {
        control.disable({ emitEvent: false });
      } else if (!disabled && control.disabled) {
        control.enable({ emitEvent: false });
      }
    }
  }
}
