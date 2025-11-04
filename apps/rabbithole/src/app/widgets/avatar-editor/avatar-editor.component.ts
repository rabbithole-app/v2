import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  model,
  signal,
} from '@angular/core';
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

import { environment } from '../../../environments/environment';
import { injectMainActor } from '../../core/injectors/main-actor';
import { AvatarCropDialogComponent } from '../avatar-crop-dialog/avatar-crop-dialog.component';
import { BrowserFSPicker } from '@rabbithole/core';
import { RbthTooltipTriggerDirective } from '@rabbithole/ui';

@Component({
  selector: 'app-avatar-editor',
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
  providers: [BrowserFSPicker, provideIcons({ lucidePencil, lucideTrash })],
  templateUrl: './avatar-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '"relative inline-block"',
  },
})
export class AvatarEditorComponent {
  readonly value = model<string | null>(null);
  avatarSrc = computed(() => {
    const backendUrl = environment.production
      ? `https://${environment.backendCanisterId}.icp0.io`
      : `https://${environment.backendCanisterId}.localhost`;
    const avatarKey = this.value();
    return avatarKey ? `${backendUrl}${avatarKey}` : null;
  });
  deleting = signal(false);

  readonly disabled = model(false);
  hasValue = computed(() => this.value() !== null);
  #isHovered = signal(false);
  showControls = computed(() => this.#isHovered() && !this.disabled());
  readonly touched = signal(false);
  private readonly _hlmDialogService = inject(HlmDialogService);
  #fsPickerService = inject(BrowserFSPicker);
  #mainActor = injectMainActor();

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
      const fileHandles = await this.#fsPickerService.showOpenFilePicker({
        multiple: false,
      });

      const files = await Promise.all(
        fileHandles.map((handle) => handle.getFile()),
      );

      if (files.length > 0 && files[0].type.startsWith('image/')) {
        this.openCropDialog(files[0]);
      }
    } catch (error) {
      // The user cancelled the file picker dialog
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
}
