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
import {
  BrnSheetContentDirective,
  BrnSheetTriggerDirective,
} from '@spartan-ng/brain/sheet';
import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
import { showDirectoryPicker } from 'native-file-system-adapter';

import { provideCoreWorker } from '../../core/injectors';
import { UploadDrawerListComponent } from './upload-drawer-list.component';
import { UploadService } from './upload.service';
import { BrowserFSPicker } from '@rabbithole/core';
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
    BrnSheetTriggerDirective,
    BrnSheetContentDirective,
    RbthDrawerComponent,
    RbthDrawerContentComponent,
    RbthDrawerHeaderComponent,
    // RbthDrawerFooterComponent,
    RbthDrawerTitleDirective,
    HlmButtonDirective,
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
      ['calchash', 'commit', 'pendind', 'processing'].includes(status),
    ),
  );
  completedItems = computed(() =>
    this.#items().filter(({ status }) => ['done'].includes(status)),
  );
  dropzoneDisabled = computed(() => !this.#uploadService.hasCommitPermission());
  failedItems = computed(() =>
    this.#items().filter(({ status }) => ['failed'].includes(status)),
  );
  fileUploadService = inject(FileUploadService, { self: true });

  // TODO: add logic for worker
  async list() {
    // const { assetManager } = this.#uploadService.state();
    // assertAssetManager(assetManager);
    // const list = await assetManager.list();
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
    // const { assetManager } = this.#uploadService.state();
    // assertAssetManager(assetManager);
    if (files instanceof FileList) {
      files = [...files];
    }
    for (const file of files) {
      this.#uploadService.addFile({ file });
    }
  }
}
