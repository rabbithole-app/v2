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
import { HlmIcon } from '@spartan-ng/helm/icon';

import {
  assertEncryptedStorage,
  ENCRYPTED_STORAGE_TOKEN,
} from '../../../injectors';
import {
  FileSystemAccessService,
  provideUploadFilesService,
} from '../../../services';
import { UPLOAD_SERVICE_TOKEN } from '../../../tokens';
import { UploadState } from '../../../types';
import { CoreFileUploadDropzoneComponent } from '../../ui';
import { UploadDrawerListComponent } from './upload-drawer-list.component';
import {
  RbthDrawerComponent,
  RbthDrawerContentComponent,
  RbthDrawerHeaderComponent,
  RbthDrawerSeparatorDirective,
  RbthDrawerTitleDirective,
} from '@rabbithole/ui';

@Component({
  selector: 'core-upload-drawer',
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
    provideUploadFilesService(),
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
  #uploadService = inject(UPLOAD_SERVICE_TOKEN, { self: true });
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
  #fsAccessService = inject(FileSystemAccessService);

  async list() {
    const encryptedStorage = this.encryptedStorage();
    assertEncryptedStorage(encryptedStorage);
    const list = await encryptedStorage.list();
    console.log(list);
  }

  async upload(files: File[] | FileList) {
    if (files instanceof FileList) {
      files = Array.from(files);
    }
    for (const file of files) {
      this.#uploadService.add({ file });
    }
  }

  async uploadDirectory() {
    const items = await this.#fsAccessService.list();
    for (const item of items) {
      if (item.kind === 'file') {
        this.#uploadService.add({ file: item.file, path: item.parentPath });
      } else if (item.kind === 'directory') {
        const path = item.parentPath
          ? `${item.parentPath}/${item.name}`
          : item.name;
        // TODO: Add more reactive state updates when creating a directory
        this.encryptedStorage().createDirectory(path);
      }
    }
  }
}
