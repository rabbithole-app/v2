import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { hexStringToUint8Array, toNullable, uint8ArrayToHexString } from '@dfinity/utils';
import type { IcManagementDid } from '@icp-sdk/canisters/ic-management';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBinary,
  lucideCircleAlert,
  lucideGithub,
  lucideUpload,
  lucideX,
} from '@ng-icons/lucide';
import { BrnSelectImports } from '@spartan-ng/brain/select';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';
import type { ClassValue } from 'clsx';
import { toast } from 'ngx-sonner';
import { match, P } from 'ts-pattern';

import { AUTH_SERVICE } from '@rabbithole/auth';
import {
  encodeStorageInitArgs,
  FileSystemAccessService,
  FormatBytesPipe,
  IS_PRODUCTION_TOKEN,
} from '@rabbithole/core';
import {
  RbthDrawerComponent,
  RbthDrawerContentComponent,
  RbthDrawerFooterComponent,
  RbthDrawerHeaderComponent,
  RbthDrawerSeparatorDirective,
  RbthDrawerTitleDirective,
} from '@rabbithole/ui';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmProgressImports } from '@spartan-ng/helm/progress';
import { HlmRadioGroupImports } from '@spartan-ng/helm/radio-group';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { hlm } from '@spartan-ng/helm/utils';

import { WasmInstallService } from '../../services';
import { WasmInstallTriggerDirective } from './wasm-install-trigger.directive';

@Component({
  selector: 'rbth-feat-canisters-wasm-install',
  imports: [
    ...HlmAlertImports,
    ...HlmButtonImports,
    ...HlmCheckboxImports,
    ...HlmEmptyImports,
    ...HlmProgressImports,
    ...HlmRadioGroupImports,
    ...BrnSelectImports,
    ...HlmSelectImports,
    ...HlmSpinnerImports,
    ...HlmTabsImports,
    HlmTextarea,
    BrnSheetContent,
    RbthDrawerComponent,
    RbthDrawerContentComponent,
    RbthDrawerFooterComponent,
    RbthDrawerHeaderComponent,
    RbthDrawerSeparatorDirective,
    RbthDrawerTitleDirective,
    WasmInstallTriggerDirective,
    NgIcon,
    HlmIcon,
    DecimalPipe,
    FormatBytesPipe,
  ],
  providers: [
    WasmInstallService,
    provideIcons({
      lucideBinary,
      lucideCircleAlert,
      lucideGithub,
      lucideUpload,
      lucideX,
    }),
  ],
  templateUrl: './wasm-install.component.html',
  host: {
    '[class]': '_computedClass()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WasmInstallComponent {
  readonly drawer = viewChild(RbthDrawerComponent);
  #wasmInstallService = inject(WasmInstallService);
  readonly installState = this.#wasmInstallService.state;
  readonly errorMessage = computed(() => {
    const state = this.installState();
    if (state.status === 'failed') {
      return state.errorMessage;
    }
    return null;
  });
  readonly initArgHex = signal<string>('');
  readonly installMode = signal<'install' | 'reinstall' | 'upgrade'>('upgrade');
  readonly selectedFile = signal<File | null>(null);
  readonly isButtonDisabled = computed(() => {
    const state = this.installState();
    return (
      !this.selectedFile() ||
      state.status === 'uploading' ||
      state.status === 'installing'
    );
  });
  readonly isProcessing = computed(() => {
    const state = this.installState();
    return state.status === 'uploading' || state.status === 'installing';
  });
  readonly isUpgradeMode = computed(() => this.installMode() === 'upgrade');
  readonly progress = computed(() => {
    const state = this.installState();
    if (state.status === 'uploading') {
      return Math.round((state.progress / state.total) * 100);
    }
    return 0;
  });
  readonly skipPreUpgrade = signal<boolean>(false);
  readonly skipPreUpgradeValue = signal<boolean>(false);
  readonly statusText = computed(() =>
    match(this.installState())
      .with({ status: 'uploading' }, () => 'Uploading WASM...')
      .with({ status: 'installing' }, () => 'Installing WASM...')
      .otherwise(() => 'Install WASM'),
  );
  readonly trigger = contentChild(WasmInstallTriggerDirective);
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  readonly wasmFile = computed(() => {
    const state = this.#wasmInstallService.state();
    if (state.status === 'uploading' || state.status === 'installing') {
      return null; // File is being processed
    }
    return null; // Will be managed separately
  });
  readonly wasmMemoryPersistence = signal<'keep' | 'replace'>('keep');
  readonly wasmMemoryPersistenceEnabled = signal<boolean>(false);
  protected readonly _computedClass = computed(() =>
    hlm('flex flex-col gap-y-4', this.userClass()),
  );
  readonly #authService = inject(AUTH_SERVICE);
  #fileSystemAccessService = inject(FileSystemAccessService);
  readonly #isProduction = inject(IS_PRODUCTION_TOKEN);

  constructor() {
    // Connect the directive to the drawer via effect
    effect(() => {
      const trigger = this.trigger();
      const drawer = this.drawer();
      if (trigger && drawer) {
        trigger.setDrawer(drawer);
      }
    });

    // Generate default initArg on initialization
    this.#generateDefaultInitArg();
  }

  async fileOpen() {
    const fileHandle = await this.#fileSystemAccessService.fileOpen({
      mimeTypes: ['application/wasm'],
      extensions: ['.wasm'],
      description: 'WASM file',
      startIn: 'downloads',
      id: 'wasm-files',
      excludeAcceptAllOption: true,
    });
    const file = await match(fileHandle)
      .with({ handle: P.nonNullable.select() }, (handle) => handle.getFile())
      .run();
    this.selectedFile.set(file);
  }

  handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files[0];
    if (file && file.name.endsWith('.wasm')) {
      this.onFileSelected(file);
    }
  }

  onCancel() {
    this.selectedFile.set(null);
  }

  onFileInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file && file.name.endsWith('.wasm')) {
      this.onFileSelected(file);
    }
  }

  onFileSelected(file: File) {
    this.selectedFile.set(file);
  }

  async onInstall() {
    const file = this.selectedFile();
    if (file) {
      try {
        let mode: IcManagementDid.canister_install_mode = { upgrade: [] };
        switch (this.installMode()) {
          case 'install':
            mode = { install: null };
            break;
          case 'reinstall':
            mode = { reinstall: null };
            break;
          case 'upgrade': {
            const skipPreUpgrade: ReturnType<typeof toNullable<boolean>> =
              this.skipPreUpgrade()
                ? toNullable(this.skipPreUpgradeValue())
                : [];
            const wasmMemoryPersistenceEnabled =
              this.wasmMemoryPersistenceEnabled();
            const wasmMemoryPersistence = this.wasmMemoryPersistence();
            const persistence: ReturnType<
              typeof toNullable<{ keep: null } | { replace: null }>
            > = wasmMemoryPersistenceEnabled
              ? toNullable(
                  wasmMemoryPersistence === 'keep'
                    ? { keep: null }
                    : { replace: null },
                )
              : [];
            if (skipPreUpgrade.length || persistence.length) {
              mode = {
                upgrade: [
                  {
                    skip_pre_upgrade: skipPreUpgrade,
                    wasm_memory_persistence: persistence,
                  },
                ],
              };
            }
            break;
          }
          default:
            throw new Error('Invalid install mode');
        }
        // Convert hex initArg to Uint8Array
        const initArg = hexStringToUint8Array(this.initArgHex());

        await this.#wasmInstallService.install(file, mode, initArg);
        this.selectedFile.set(null);
        toast.success('WASM installed successfully');
      } catch {
        // Error is handled by state
      }
    }
  }

  onInstallModeChange(value: 'install' | 'reinstall' | 'upgrade' | undefined) {
    if (value) {
      this.installMode.set(value);
    }
  }

  onWasmMemoryPersistenceChange(
    value: ('keep' | 'replace')[] | 'keep' | 'replace' | undefined,
  ) {
    if (value && !Array.isArray(value)) {
      this.wasmMemoryPersistence.set(value);
    }
  }

  #generateDefaultInitArg(): void {
    const owner = this.#authService.identity().getPrincipal();
    const vetKeyName = this.#isProduction ? 'key_1' : 'dfx_test_key';
    const initArgBytes = encodeStorageInitArgs({ owner, vetKeyName });
    const hex = uint8ArrayToHexString(initArgBytes);
    this.initArgHex.set(hex);
  }
}
