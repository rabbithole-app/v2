import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { arrayBufferToUint8Array } from '@dfinity/utils';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFileArchive,
  lucideGithub,
  lucidePackage,
  lucideUpload,
  lucideX,
} from '@ng-icons/lucide';
import { BrnProgress } from '@spartan-ng/brain/progress';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmEmptyImports } from '@spartan-ng/helm/empty';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmProgressImports } from '@spartan-ng/helm/progress';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { hlm } from '@spartan-ng/helm/utils';
import type { ClassValue } from 'clsx';
import { unzipSync } from 'fflate';
import { match, P } from 'ts-pattern';

import {
  FileSystemAccessService,
  UPLOAD_ASSETS_SERVICE_PROVIDERS,
} from '../../../services';
import { UPLOAD_SERVICE_TOKEN } from '../../../tokens';
import { UploadState } from '../../../types';
import { FormatBytesPipe } from '../../ui';
import { UploadDrawerListComponent } from '../../upload/upload-drawer-list/upload-drawer-list.component';
import { FrontendUploadTriggerDirective } from './frontend-upload-trigger.directive';
import {
  RbthDrawerComponent,
  RbthDrawerContentComponent,
  RbthDrawerFooterComponent,
  RbthDrawerHeaderComponent,
  RbthDrawerSeparatorDirective,
  RbthDrawerTitleDirective,
} from '@rabbithole/ui';

@Component({
  selector: 'core-frontend-upload-drawer',
  imports: [
    ...HlmButtonImports,
    ...HlmProgressImports,
    ...HlmSpinnerImports,
    ...HlmTabsImports,
    ...HlmEmptyImports,
    BrnSheetContent,
    BrnProgress,
    RbthDrawerComponent,
    RbthDrawerContentComponent,
    RbthDrawerFooterComponent,
    RbthDrawerHeaderComponent,
    RbthDrawerSeparatorDirective,
    RbthDrawerTitleDirective,
    FrontendUploadTriggerDirective,
    NgIcon,
    HlmIcon,
    DecimalPipe,
    FormatBytesPipe,
    UploadDrawerListComponent,
  ],
  providers: [
    UPLOAD_ASSETS_SERVICE_PROVIDERS,
    provideIcons({
      lucideFileArchive,
      lucideGithub,
      lucidePackage,
      lucideUpload,
      lucideX,
    }),
  ],
  templateUrl: './frontend-upload.component.html',
  host: {
    '[class]': '_computedClass()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FrontendUploadDrawerComponent {
  #uploadService = inject(UPLOAD_SERVICE_TOKEN, { self: true });
  files = computed(() => this.#uploadService.state().files);
  readonly activeItems = computed(() =>
    this.files().filter(({ status }) =>
      [
        UploadState.FINALIZING,
        UploadState.IN_PROGRESS,
        UploadState.INITIALIZING,
        UploadState.NOT_STARTED,
        UploadState.REQUESTING_VETKD,
      ].includes(status),
    ),
  );
  readonly archiveFile = signal<File | null>(null);
  readonly completedFiles = computed(
    () =>
      this.#uploadService
        .state()
        .files.filter(({ status }) => status === UploadState.COMPLETED).length,
  );
  readonly completedItems = computed(() =>
    this.files().filter(({ status }) => status === UploadState.COMPLETED),
  );
  readonly drawer = viewChild(RbthDrawerComponent);
  readonly failedItems = computed(() =>
    this.files().filter(({ status }) => status === UploadState.FAILED),
  );
  readonly icons = { fileArchive: lucideFileArchive };
  isProcessing = computed(() => this.#uploadService.state().isProcessing);
  overallProgress = computed(() => this.#uploadService.state().overallProgress);
  readonly statusText = computed(() => {
    if (this.isProcessing()) {
      return 'Uploading...';
    }
    return 'Upload';
  });
  readonly totalFiles = computed(() => this.files().length);
  readonly trigger = contentChild(FrontendUploadTriggerDirective);
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    hlm('flex flex-col gap-y-4', this.userClass()),
  );
  #fsAccessService = inject(FileSystemAccessService);

  constructor() {
    // Connect the directive to the drawer via effect
    effect(() => {
      const trigger = this.trigger();
      const drawer = this.drawer();
      if (trigger && drawer) {
        trigger.setDrawer(drawer);
      }
    });
  }

  async fileOpen() {
    const fileHandle = await this.#fsAccessService.fileOpen({
      mimeTypes: ['application/zip'],
      extensions: ['.zip'],
      description: 'Zip archive',
      startIn: 'downloads',
      id: 'projects',
      excludeAcceptAllOption: true,
    });
    const file = await match(fileHandle)
      .with({ handle: P.nonNullable.select() }, (handle) => handle.getFile())
      .run();
    this.archiveFile.set(file);
  }

  handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files[0];
    if (file) {
      this.onFileSelected(file);
    }
  }

  onCancel() {
    this.archiveFile.set(null);
    this.#uploadService.clear();
  }

  onFileInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.onFileSelected(file);
    }
  }

  onFileSelected(file: File) {
    this.archiveFile.set(file);
  }

  async onInstall() {
    const file = this.archiveFile();
    if (file) {
      this.#uploadService.clear();
      const zipData = await file.arrayBuffer();
      const files = unzipSync(arrayBufferToUint8Array(zipData), {
        filter: ({ name, originalSize }) =>
          !name.endsWith('/') && originalSize >= 0,
      });
      for (const [key, u8] of Object.entries(files)) {
        const segments = key.split('/');
        const filename = segments.pop();
        if (filename) {
          const path = segments.length > 0 ? segments.join('/') : undefined;
          const file = new File([new Uint8Array(u8)], filename);
          this.#uploadService.add({ file, path });
        }
      }
    }
  }
}
