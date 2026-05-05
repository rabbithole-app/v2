import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCross,
  lucideFolderUp,
  lucideList,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { BrnSelectImports } from '@spartan-ng/brain/select';
import { BrnSheetContent, BrnSheetTrigger } from '@spartan-ng/brain/sheet';
import { distinctUntilChanged, map } from 'rxjs';

import {
  CoreFileUploadDropzoneComponent,
  ENCRYPTED_STORAGE_CANISTER_ID,
  ENCRYPTED_STORAGE_TOKEN,
  UPLOAD_SERVICE_TOKEN,
  UploadDrawerListComponent,
  UploadRegistryService,
  UploadState,
} from '@rabbithole/core/storage-runtime';
import {
  RbthDrawerComponent,
  RbthDrawerContentComponent,
  RbthDrawerHeaderComponent,
  RbthDrawerSeparatorDirective,
  RbthDrawerTitleDirective,
} from '@rabbithole/ui/drawer';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSelectImports } from '@spartan-ng/helm/select';

import { FileListService } from '../../services';

@Component({
  selector: 'rbth-feat-file-list-upload-drawer',
  imports: [
    BrnSheetTrigger,
    BrnSheetContent,
    RbthDrawerComponent,
    RbthDrawerContentComponent,
    RbthDrawerHeaderComponent,
    RbthDrawerTitleDirective,
    HlmButton,
    HlmIcon,
    NgIcon,
    RbthDrawerSeparatorDirective,
    CoreFileUploadDropzoneComponent,
    UploadDrawerListComponent,
    BrnSelectImports,
    HlmSelectImports,
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
  #canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  selectedStorageId = signal(this.#canisterId.toText());
  #registry = inject(UploadRegistryService);
  #items = computed(() => {
    const storageId = this.selectedStorageId();
    return this.#registry.getStorageState(storageId)?.files ?? [];
  });
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
  encryptedStorage = inject(ENCRYPTED_STORAGE_TOKEN);
  failedItems = computed(() =>
    this.#items().filter(({ status }) => status === UploadState.FAILED),
  );
  fileListService = inject(FileListService);
  storagesWithUploads = this.#registry.storagesWithUploads;
  showStorageSwitcher = computed(
    () => this.storagesWithUploads().length > 1,
  );
  #uploadService = inject(UPLOAD_SERVICE_TOKEN);

  constructor() {
    this.fileListService.files$.pipe(takeUntilDestroyed()).subscribe((item) => {
      const parentPath = this.fileListService.state().parentPath;
      const filePath = parentPath
        ? item.parentPath
          ? `${parentPath}/${item.parentPath}`
          : parentPath
        : item.parentPath;
      this.#uploadService.add({ file: item.file, path: filePath });
    });
    this.fileListService.directories$
      .pipe(takeUntilDestroyed())
      .subscribe((dirPath) => {
        const parentPath = this.fileListService.state().parentPath;
        const fullPath = parentPath ? `${parentPath}/${dirPath}` : dirPath;
        this.encryptedStorage().createDirectory(fullPath);
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

  selectStorage(storageId: string) {
    this.selectedStorageId.set(storageId);
  }

  async upload(files: File[] | FileList) {
    if (files instanceof FileList) {
      files = Array.from(files);
    }
    const parentPath = this.fileListService.state().parentPath;
    for (const file of files) {
      this.#uploadService.add({
        file,
        ...(parentPath && { path: parentPath }),
      });
    }
  }
}
