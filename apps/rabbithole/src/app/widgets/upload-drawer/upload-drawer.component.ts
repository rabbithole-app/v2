import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCross,
  lucideFolderUp,
  lucideList,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { BrnSheetContent, BrnSheetTrigger } from '@spartan-ng/brain/sheet';
import { HlmButton } from '@spartan-ng/helm/button';
import { showDirectoryPicker } from 'native-file-system-adapter';

import {
  assertEncryptedStorage,
  ENCRYPTED_STORAGE_TOKEN,
  provideCoreWorker,
} from '../../core/injectors';
import { UploadDrawerListComponent } from './upload-drawer-list.component';
import { UploadService } from './upload.service';
import { BrowserFSPicker, UploadState } from '@rabbithole/core';
import {
  FileUploadService,
  RbthDrawerComponent,
  RbthDrawerContentComponent,
  RbthDrawerHeaderComponent,
  RbthDrawerSeparatorDirective,
  RbthDrawerTitleDirective,
  RbthFileUploadDropzoneComponent,
} from '@rabbithole/ui';

@Component({
  selector: 'app-upload-drawer',
  imports: [
    BrnSheetTrigger,
    BrnSheetContent,
    RbthDrawerComponent,
    RbthDrawerContentComponent,
    RbthDrawerHeaderComponent,
    // RbthDrawerFooterComponent,
    RbthDrawerTitleDirective,
    HlmButton,
    NgIcon,
    RbthDrawerSeparatorDirective,
    RbthFileUploadDropzoneComponent,
    UploadDrawerListComponent,
  ],
  providers: [
    FileUploadService,
    BrowserFSPicker,
    UploadService,
    provideIcons({
      lucideCross,
      lucideList,
      lucideTriangleAlert,
      lucideFolderUp,
    }),
    provideCoreWorker(),
  ],
  templateUrl: './upload-drawer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadDrawerComponent {
  #uploadService = inject(UploadService, {
    self: true,
  });
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
  dropzoneDisabled = computed(() => !this.#uploadService.hasWritePermission());
  encryptedStorage = inject(ENCRYPTED_STORAGE_TOKEN);
  failedItems = computed(() =>
    this.#items().filter(({ status }) => status === UploadState.FAILED),
  );
  fileUploadService = inject(FileUploadService, { self: true });

  async list() {
    const encryptedStorage = this.encryptedStorage();
    assertEncryptedStorage(encryptedStorage);
    const list = await encryptedStorage.list();
    console.log(list);
  }

  async openDirectoryPicker() {
    const dirHandle = await showDirectoryPicker();
    const [items] =
      await this.fileUploadService.listFilesAndDirsRecursively(dirHandle);
    for (const item of items) {
      this.#uploadService.addFile(item);
    }
  }

  async upload(files: File[] | FileList) {
    if (files instanceof FileList) {
      files = [...files];
    }
    for (const file of files) {
      this.#uploadService.addFile({ file });
    }
  }
}
