import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCross,
  lucideFolderUp,
  lucideList,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { BrnSheetContent, BrnSheetTrigger } from '@spartan-ng/brain/sheet';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { distinctUntilChanged, map } from 'rxjs';

import { FileListService } from '../../services';
import {
  CoreFileUploadDropzoneComponent,
  ENCRYPTED_STORAGE_TOKEN,
  UPLOAD_SERVICE_TOKEN,
  UploadDrawerListComponent,
  UploadState,
} from '@rabbithole/core';
import {
  RbthDrawerComponent,
  RbthDrawerContentComponent,
  RbthDrawerHeaderComponent,
  RbthDrawerSeparatorDirective,
  RbthDrawerTitleDirective,
} from '@rabbithole/ui';

@Component({
  selector: 'rbth-feat-file-list-upload-drawer',
  imports: [
    BrnSheetTrigger,
    BrnSheetContent,
    RbthDrawerComponent,
    RbthDrawerContentComponent,
    RbthDrawerHeaderComponent,
    // RbthDrawerFooterComponent,
    RbthDrawerTitleDirective,
    HlmButton,
    HlmIcon,
    NgIcon,
    RbthDrawerSeparatorDirective,
    CoreFileUploadDropzoneComponent,
    UploadDrawerListComponent,
  ],
  providers: [
    provideIcons({
      lucideCross,
      lucideList,
      lucideTriangleAlert,
      lucideFolderUp,
    }),
  ],
  templateUrl: './upload-drawer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadDrawerComponent {
  #uploadService = inject(UPLOAD_SERVICE_TOKEN);
  #items = computed(() => this.#uploadService.state().files);
  activeItems = computed(() =>
    this.#items().filter(({ status }) =>
      [
        UploadState.FINALIZING,
        UploadState.IN_PROGRESS,
        UploadState.INITIALIZING,
        UploadState.NOT_STARTED,
        UploadState.PAUSED,
        UploadState.REQUESTING_VETKD,
      ].includes(status),
    ),
  );
  completedItems = computed(() =>
    this.#items().filter(({ status }) => status === UploadState.COMPLETED),
  );
  dropzoneDisabled = computed(() => !this.#uploadService.hasPermission());
  encryptedStorage = inject(ENCRYPTED_STORAGE_TOKEN);
  failedItems = computed(() =>
    this.#items().filter(({ status }) => status === UploadState.FAILED),
  );
  fileListService = inject(FileListService);

  constructor() {
    this.fileListService.files$.pipe(takeUntilDestroyed()).subscribe((item) => {
      this.#uploadService.add({ file: item.file, path: item.parentPath });
    });
    this.fileListService.directories$
      .pipe(takeUntilDestroyed())
      .subscribe((path) => {
        this.encryptedStorage().createDirectory(path);
      });
    toObservable(this.#uploadService.state)
      .pipe(
        map((state) => state.completedCount),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.fileListService.reload();
      });
  }

  async upload(files: File[] | FileList) {
    if (files instanceof FileList) {
      files = Array.from(files);
    }
    for (const file of files) {
      this.#uploadService.add({ file });
    }
  }
}
