import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFolderOpen,
  lucideFolderPlus,
  lucideFolderUp,
  lucideUpload,
} from '@ng-icons/lucide';
import { filter, map, mergeWith } from 'rxjs';

import {
  ENCRYPTED_STORAGE_CANISTER_ID,
  injectCoreWorker,
  provideUploadFilesService,
} from '@rabbithole/core';
import { HlmContextMenuImports } from '@spartan-ng/helm/context-menu';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';

import { GRAY_ICONS_CONFIG } from '../../constants';
import { FileListService } from '../../services';
import { FILE_LIST_ICONS_CONFIG } from '../../tokens';
import { NodeItem } from '../../types';
import { AnimatedFolderComponent } from '../animated-folder/animated-folder.component';
import { FileIconComponent } from '../file-icon/file-icon.component';
import { GridViewComponent } from '../grid-view/grid-view.component';
import { UploadDrawerComponent } from '../upload-drawer/upload-drawer.component';

@Component({
  selector: 'rbth-feat-file-list-view',
  templateUrl: './file-list-view.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    UploadDrawerComponent,
    AnimatedFolderComponent,
    FileIconComponent,
    GridViewComponent,
    NgIcon,
    HlmContextMenuImports,
    HlmDropdownMenuImports,
    HlmEmptyImports,
  ],
  providers: [
    provideUploadFilesService(),
    FileListService,
    { provide: FILE_LIST_ICONS_CONFIG, useValue: GRAY_ICONS_CONFIG },
    provideIcons({
      lucideFolderPlus,
      lucideUpload,
      lucideFolderUp,
      lucideFolderOpen,
    }),
  ],
})
export class FileListViewComponent {
  active = signal(false);
  canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);
  fileListService = inject(FileListService);
  #route = inject(ActivatedRoute);
  items = toSignal(
    this.#route.data.pipe(
      map((data) => data['fileList'] as NodeItem[]),
      mergeWith(
        toObservable(this.fileListService.items.value).pipe(filter((v) => !!v)),
      ),
    ),
    { requireSync: true },
  );
  #coreWorkerService = injectCoreWorker();

  constructor() {
    this.#coreWorkerService.postMessage({
      action: 'worker:init-storage',
      payload: this.canisterId.toText(),
    });
    this.#route.url
      .pipe(
        map((url) => {
          const segments = url.map((segment) => segment.path);
          return segments.length > 0 ? segments.join('/') : null;
        }),
        takeUntilDestroyed(),
      )
      .subscribe((parentPath) =>
        this.fileListService.setParentPath(parentPath),
      );
  }

  _handleDelete(selected: bigint[]) {
    this.fileListService.delete(selected);
  }

  _handleDownload(selected: bigint[]) {
    this.fileListService.download(selected);
  }

  _handleMove(selected: bigint[]) {
    console.log('move', selected);
  }

  _handleRename(selected: bigint[]) {
    console.log('rename', selected);
  }
}
