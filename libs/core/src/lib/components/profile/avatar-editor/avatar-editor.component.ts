import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  model,
  signal,
} from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePencil, lucideTrash } from '@ng-icons/lucide';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { match, P } from 'ts-pattern';

import {
  HlmAvatar,
  HlmAvatarFallback,
  HlmAvatarImage,
} from '@spartan-ng/helm/avatar';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { FileSystemAccessService } from '../../../services/file-system-access.service';
import { MAIN_BACKEND_URL_TOKEN } from '../../../tokens/main';
import { AvatarCropDialogComponent } from '../avatar-crop-dialog/avatar-crop-dialog.component';

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
    ...HlmTooltipImports,
  ],
  providers: [provideIcons({ lucidePencil, lucideTrash })],
  templateUrl: './avatar-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '"relative inline-block"',
  },
})
export class AvatarEditorComponent implements FormValueControl<string | null> {
  readonly backendUrl = inject(MAIN_BACKEND_URL_TOKEN);

  /** FormValueControl contract — Signal Forms binds this automatically via [formField]. */
  readonly value = model<string | null>(null);
  readonly avatarSrc = computed(() => {
    const avatarKey = this.value();
    return avatarKey ? `${this.backendUrl}${avatarKey}` : null;
  });
  readonly disabled = model(false);

  readonly hasValue = computed(() => this.value() !== null);
  #isHovered = signal(false);

  readonly showControls = computed(() => this.#isHovered() && !this.disabled());
  readonly touched = model(false);

  readonly #fsAccessService = inject(FileSystemAccessService);
  readonly #hlmDialogService = inject(HlmDialogService);

  handleDelete() {
    if (this.disabled()) return;
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
      if ((error as Error).name !== 'AbortError') {
        console.error('Error selecting file:', error);
      }
    }
  }

  onMouseEnter() {
    this.#isHovered.set(true);
  }

  onMouseLeave() {
    this.#isHovered.set(false);
  }

  openCropDialog(file: File) {
    const dialogRef = this.#hlmDialogService.open(AvatarCropDialogComponent, {
      context: {
        image: file,
      },
      id: 'avatar-crop-dialog',
      contentClass: 'w-[720px] sm:max-w-[90vw] sm:max-h-[90vh] aspect-auto',
    }) as BrnDialogRef<string | undefined>;

    dialogRef.closed$.subscribe((avatarKey) => {
      if (avatarKey !== undefined) {
        this.value.set(avatarKey ?? null);
        this.touched.set(true);
      }
    });
  }
}
