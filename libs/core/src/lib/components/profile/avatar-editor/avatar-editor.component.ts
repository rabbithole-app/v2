import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  model,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePencil, lucideTrash } from '@ng-icons/lucide';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import {
  HlmAvatar,
  HlmAvatarFallback,
  HlmAvatarImage,
} from '@spartan-ng/helm/avatar';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { match, P } from 'ts-pattern';

import { injectMainActor } from '../../../injectors/main-actor';
import { FileSystemAccessService } from '../../../services/file-system-access.service';
import { MAIN_BACKEND_URL_TOKEN } from '../../../tokens/main';
import { AvatarCropDialogComponent } from '../avatar-crop-dialog/avatar-crop-dialog.component';
import { RbthTooltipTriggerDirective } from '@rabbithole/ui';

@Component({
  selector: 'core-avatar-editor',
  standalone: true,
  imports: [
    HlmAvatar,
    HlmAvatarFallback,
    HlmAvatarImage,
    HlmButton,
    HlmIcon,
    NgIcon,
    RbthTooltipTriggerDirective,
    HlmSpinner,
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AvatarEditorComponent),
      multi: true,
    },
    provideIcons({ lucidePencil, lucideTrash }),
  ],
  templateUrl: './avatar-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '"relative inline-block"',
  },
})
export class AvatarEditorComponent implements ControlValueAccessor {
  readonly backendUrl = inject(MAIN_BACKEND_URL_TOKEN);
  readonly value = model<string | null>(null);
  avatarSrc = computed(() => {
    const avatarKey = this.value();
    return avatarKey ? `${this.backendUrl}${avatarKey}` : null;
  });
  deleting = signal(false);

  readonly disabled = model(false);
  hasValue = computed(() => this.value() !== null);
  #isHovered = signal(false);
  showControls = computed(() => this.#isHovered() && !this.disabled());
  readonly touched = signal(false);
  private readonly _hlmDialogService = inject(HlmDialogService);
  #fsAccessService = inject(FileSystemAccessService);
  #mainActor = injectMainActor();

  constructor() {
    effect(() => this.onChanged(this.value()));
  }

  async handleDelete() {
    if (this.disabled()) return;
    const avatarKey = this.value();
    const actor = this.#mainActor();
    if (avatarKey) {
      const filename = avatarKey.split('/').pop() as string;
      try {
        this.deleting.set(true);
        await actor.removeAvatar(filename);
      } finally {
        this.deleting.set(false);
      }
    }

    this.value.set(null);
    this.touched.set(true);
  }

  async handleEdit() {
    if (this.disabled()) return;

    try {
      const fileHandle = await this.#fsAccessService.fileOpen({
        multiple: false,
      });

      const file = await match(fileHandle)
        .with({ handle: P.nonNullable.select() }, (handle) => handle.getFile())
        .run();

      if (file.type.startsWith('image/')) {
        this.openCropDialog(file);
      }
    } catch (error) {
      // The user cancelled the file picker dialog
      if ((error as Error).name !== 'AbortError') {
        console.error('Error selecting file:', error);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
  onChanged = (value: string | null) => {};

  onMouseEnter() {
    this.#isHovered.set(true);
  }

  onMouseLeave() {
    this.#isHovered.set(false);
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onTouched = () => {};

  openCropDialog(file: File) {
    const dialogRef = this._hlmDialogService.open(AvatarCropDialogComponent, {
      context: {
        image: file,
      },
      id: 'avatar-crop-dialog',
      contentClass: 'w-[720px] sm:max-w-[90vw] sm:max-h-[90vh] aspect-auto',
    }) as BrnDialogRef<string | undefined>;

    dialogRef.closed$.subscribe((avatarKey) => {
      this.value.set(avatarKey ?? null);
    });
  }

  registerOnChange(fn: () => void): void {
    this.onChanged = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? null);
  }
}
