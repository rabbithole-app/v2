import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePencil, lucideTrash } from '@ng-icons/lucide';
import { BrnDialogRef } from '@spartan-ng/brain/dialog';
import { toast } from '@spartan-ng/brain/sonner';
import { match, P } from 'ts-pattern';

import type { AvatarRef } from '@rabbithole/declarations/backend';
import {
  HlmAvatar,
  HlmAvatarFallback,
  HlmAvatarImage,
} from '@spartan-ng/helm/avatar';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDialogService } from '@spartan-ng/helm/dialog';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { AvatarService } from '../../../services/avatar.service';
import { FileSystemAccessService } from '../../../services/file-system-access.service';
import {
  AvatarCropDialogComponent,
  type AvatarCropDialogResult,
} from '../avatar-crop-dialog/avatar-crop-dialog.component';

@Component({
  selector: 'rbth-core-avatar-editor',
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
export class AvatarEditorComponent {
  readonly avatarChanged = output<AvatarRef | null>();
  readonly avatarRef = input<AvatarRef | null>(null);
  readonly #avatarService = inject(AvatarService);
  readonly avatarSrc = computed(() =>
    this.#avatarService.avatarSrc(this.avatarRef()),
  );
  readonly disabled = input(false);

  readonly saving = signal(false);
  readonly disabledState = computed(() => this.disabled() || this.saving());
  readonly hasValue = computed(() => this.avatarRef() !== null);

  #isHovered = signal(false);
  readonly showControls = computed(
    () => this.#isHovered() && !this.disabledState(),
  );

  readonly #fsAccessService = inject(FileSystemAccessService);
  readonly #hlmDialogService = inject(HlmDialogService);

  async handleDelete() {
    if (this.disabledState()) return;
    const id = toast.loading('Deleting avatar...');
    try {
      await this.#avatarService.clearAvatar();
      this.avatarChanged.emit(null);
      toast.success('Avatar deleted', { id });
    } catch (error) {
      console.error('Failed to delete avatar', error);
      toast.error('Failed to delete avatar', { id });
    }
  }

  async handleEdit() {
    if (this.disabledState()) return;

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
    }) as BrnDialogRef<AvatarCropDialogResult | undefined>;

    dialogRef.closed$.subscribe((result) => {
      if (result === undefined) return;

      if ('error' in result) {
        toast.error('Failed to prepare avatar', {
          description: result.error,
          duration: 10_000,
        });
        return;
      }

      void this.#saveAvatar(result.content, result.contentType);
    });
  }

  #errorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return 'Unknown error';
  }

  async #saveAvatar(content: Uint8Array, contentType: string) {
    this.saving.set(true);
    const id = toast.loading('Saving avatar...');

    try {
      const avatarRef = await this.#avatarService.uploadAvatar(
        content,
        contentType,
      );
      this.avatarChanged.emit(avatarRef);
      toast.success('Avatar saved successfully', { id });
    } catch (error) {
      const message = this.#errorMessage(error);
      console.error('Failed to save avatar', error);
      toast.dismiss(id);
      toast.error('Failed to save avatar', {
        description: message,
        duration: 10_000,
      });
    } finally {
      this.saving.set(false);
    }
  }
}
