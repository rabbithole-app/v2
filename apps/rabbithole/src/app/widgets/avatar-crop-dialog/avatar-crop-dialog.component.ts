import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { arrayBufferToUint8Array } from '@dfinity/utils';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButton } from '@spartan-ng/helm/button';
import {
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import mime from 'mime/lite';
import { nanoid } from 'nanoid';
import {
  CropperPosition,
  Dimensions,
  ImageCropperComponent,
  LoadedImage,
} from 'ngx-image-cropper';
import { toast } from 'ngx-sonner';
import {
  catchError,
  finalize,
  first,
  from,
  iif,
  map,
  mergeWith,
  Observable,
  switchMap,
  throwError,
} from 'rxjs';

import { injectMainActor } from '@rabbithole/core';
import {
  ImageCropPayload,
  injectCoreWorker,
  isPhotonSupportedMimeType,
  MAX_AVATAR_HEIGHT,
  MAX_AVATAR_WIDTH,
  messageByAction,
} from '@rabbithole/core';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'avatar-crop-dialog',
  standalone: true,
  templateUrl: './avatar-crop-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmButton,
    ImageCropperComponent,
    HlmSpinner,
  ],
  host: {
    class: 'contents',
    style: '--cropper-outline-color: rgba(0, 0, 0, .3)',
  },
})
export class AvatarCropDialogComponent {
  cropperPosition = signal<CropperPosition | null>(null);
  displaySize = signal<Dimensions | null>(null);
  imageCropper = viewChild.required<ImageCropperComponent>(
    ImageCropperComponent,
  );
  readonly imageCropperOptions = {
    aspectRatio: 1,
    maintainAspectRatio: true,
    format: 'jpeg' as const,
    resizeToWidth: MAX_AVATAR_WIDTH,
    resizeToHeight: MAX_AVATAR_HEIGHT,
    onlyScaleDown: true,
    roundCropper: true,
    autoCrop: false,
    containWithinAspectRatio: false,
  };
  loadedImage = signal<LoadedImage | null>(null);
  loading = signal(false);
  private readonly _dialogContext = injectBrnDialogContext<{ image: File }>();
  protected readonly image = this._dialogContext.image;
  private readonly _dialogRef =
    inject<BrnDialogRef<string | undefined>>(BrnDialogRef);
  #coreWorkerService = injectCoreWorker();
  #destroyRef = inject(DestroyRef);
  #id = crypto.randomUUID();

  #mainActor = injectMainActor();

  close(avatarKey?: string) {
    this._dialogRef.close(avatarKey);
  }

  save() {
    const cropperPosition = this.cropperPosition();
    const loadedImage = this.loadedImage();
    const displaySize = this.displaySize();

    if (!cropperPosition || !loadedImage || !displaySize) return;

    this.loading.set(true);
    const id = toast.loading('Cropping image...');
    iif(
      () => isPhotonSupportedMimeType(this.image.type),
      from(this.image.arrayBuffer()).pipe(
        switchMap((bytes) => {
          const originalPosition = this.#convertCropperPositionToOriginal(
            cropperPosition,
            loadedImage.original.size,
            displaySize,
          );
          return this.#cropThroughWorker(
            bytes,
            this.image.type,
            originalPosition,
          );
        }),
      ),
      this.#crop(),
    )
      .pipe(
        switchMap(({ buffer, contentType }) => {
          const actor = this.#mainActor();
          const extension = mime.getExtension(contentType);
          toast.loading('Saving avatar...', { id });
          return actor.saveAvatar({
            filename: `avatar_${nanoid(4)}.${extension}`,
            content: arrayBufferToUint8Array(buffer),
            contentType,
          });
        }),
        finalize(() => this.loading.set(false)),
        catchError((err) => {
          toast.error('Failed to save avatar: ' + err.message, { id });
          return throwError(() => err);
        }),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe((avatarKey) => {
        toast.success('Avatar saved successfully', { id });
        this.close(avatarKey);
      });
  }

  /**
   * Converts cropper position coordinates from display size to original image size.
   *
   * @param cropperPosition - Position relative to the cropper container size
   * @param originalSize - Original image dimensions
   * @param displaySize - Cropper container dimensions (from cropperReady event)
   * @returns Position relative to original image size
   */
  #convertCropperPositionToOriginal(
    cropperPosition: CropperPosition,
    originalSize: Dimensions,
    displaySize: Dimensions,
  ): CropperPosition {
    const ratioW = originalSize.width / displaySize.width;
    const ratioH = originalSize.height / displaySize.height;

    return {
      x1: Math.round(cropperPosition.x1 * ratioW),
      y1: Math.round(cropperPosition.y1 * ratioH),
      x2: Math.round(cropperPosition.x2 * ratioW),
      y2: Math.round(cropperPosition.y2 * ratioH),
    };
  }

  #crop(): Observable<{ buffer: ArrayBuffer; contentType: string }> {
    const imageCropper = this.imageCropper();
    return from(
      imageCropper.crop('blob') ??
        throwError(() => new Error('Failed to crop image')),
    ).pipe(
      switchMap((event) =>
        from((event.blob as Blob).arrayBuffer()).pipe(
          map((buffer) => ({
            buffer,
            contentType:
              (event.blob as Blob).type ??
              mime.getType(this.imageCropperOptions.format),
          })),
        ),
      ),
    );
  }

  #cropThroughWorker(
    bytes: ArrayBuffer,
    imageType: string,
    position: CropperPosition,
  ): Observable<{ buffer: ArrayBuffer; contentType: string }> {
    const offscreen = new OffscreenCanvas(MAX_AVATAR_WIDTH, MAX_AVATAR_HEIGHT);
    const payload: ImageCropPayload = {
      id: this.#id,
      bytes,
      imageType,
      cropper: {
        maxSize: { width: MAX_AVATAR_WIDTH, height: MAX_AVATAR_HEIGHT },
        position,
      },
      offscreenCanvas: offscreen,
    };
    this.#coreWorkerService.postMessage(
      { action: 'image:crop', payload },
      { transfer: [payload.offscreenCanvas, payload.bytes] },
    );
    const cropDone$ = this.#coreWorkerService.workerMessage$.pipe(
      messageByAction('image:crop-done'),
      first((message) => message.payload.id === this.#id),
    );
    const cropFailed$ = this.#coreWorkerService.workerMessage$.pipe(
      messageByAction('image:crop-failed'),
      first((message) => message.payload.id === this.#id),
    );
    return cropDone$.pipe(
      mergeWith(cropFailed$),
      map(({ action, payload }) => {
        if (action === 'image:crop-failed') {
          throw Error(payload.errorMessage);
        }
        return { buffer: payload.bytes, contentType: payload.imageType };
      }),
    );
  }
}
