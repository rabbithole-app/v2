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
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideFileArchive,
  lucideGithub,
  lucidePackage,
  lucideUpload,
  lucideX,
} from '@ng-icons/lucide';
import { BrnSheetContent } from '@spartan-ng/brain/sheet';
import { toast } from '@spartan-ng/brain/sonner';
import type { ClassValue } from 'clsx';
import { match, P } from 'ts-pattern';

import { FileSystemAccessService } from '@rabbithole/core';
import {
  IAssetUploadService,
  UPLOAD_ASSETS_SERVICE_PROVIDERS,
  UPLOAD_SERVICE_TOKEN,
  UploadState,
} from '@rabbithole/core/storage-runtime';
import { uint8ArrayToArrayBuffer } from '@rabbithole/encrypted-storage';
import {
  RbthDrawerComponent,
  RbthDrawerContentComponent,
  RbthDrawerFooterComponent,
  RbthDrawerHeaderComponent,
  RbthDrawerSeparatorDirective,
  RbthDrawerTitleDirective,
} from '@rabbithole/ui/drawer';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';
import { hlm } from '@spartan-ng/helm/utils';

import { FrontendTakeOwnershipAlertComponent } from '../frontend-take-ownership/frontend-take-ownership-alert.component';
import { FrontendTakeOwnershipButtonComponent } from '../frontend-take-ownership/frontend-take-ownership-button.component';
import { FrontendUploadListComponent } from '../frontend-upload-list/frontend-upload-list.component';
import { extractFrontendArchive } from './frontend-archive';
import { FrontendUploadArchivePreviewComponent } from './frontend-upload-archive-preview.component';
import { FrontendUploadFileSelectionComponent } from './frontend-upload-file-selection.component';
import { FrontendUploadGithubSelectionComponent } from './frontend-upload-github-selection.component';
import { FrontendUploadProgressComponent } from './frontend-upload-progress.component';
import { FrontendUploadTriggerDirective } from './frontend-upload-trigger.directive';

@Component({
  selector: 'rbth-feat-canisters-frontend-upload-drawer',
  imports: [
    ...HlmAlertImports,
    HlmButtonImports,
    HlmSpinnerImports,
    HlmTabsImports,
    BrnSheetContent,
    RbthDrawerComponent,
    RbthDrawerContentComponent,
    RbthDrawerFooterComponent,
    RbthDrawerHeaderComponent,
    RbthDrawerSeparatorDirective,
    RbthDrawerTitleDirective,
    FrontendTakeOwnershipAlertComponent,
    FrontendTakeOwnershipButtonComponent,
    FrontendUploadFileSelectionComponent,
    FrontendUploadGithubSelectionComponent,
    FrontendUploadArchivePreviewComponent,
    FrontendUploadProgressComponent,
    FrontendUploadListComponent,
    NgIcon,
    HlmIcon,
  ],
  providers: [
    UPLOAD_ASSETS_SERVICE_PROVIDERS,
    provideIcons({
      lucideCircleAlert,
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
  #uploadService = inject(UPLOAD_SERVICE_TOKEN, {
    self: true,
  }) as IAssetUploadService;
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
  readonly hasPermission = computed(() => this.#uploadService.hasPermission());
  readonly icons = { fileArchive: lucideFileArchive };
  readonly installErrorMessage = signal<string | null>(null);
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
      mimeTypes: [
        'application/gzip',
        'application/x-gzip',
        'application/x-tar',
      ],
      extensions: ['.tar', '.tar.gz', '.tgz'],
      description: 'Frontend archive',
      startIn: 'downloads',
      id: 'projects',
      excludeAcceptAllOption: true,
    });
    const file = await match(fileHandle)
      .with({ handle: P.nonNullable.select() }, (handle) => handle.getFile())
      .run();
    this.onFileSelected(file);
  }

  onCancel() {
    this.archiveFile.set(null);
    this.installErrorMessage.set(null);
    this.#uploadService.clear();
  }

  onFileDropped(file: File) {
    this.onFileSelected(file);
  }

  onFileInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.onFileSelected(file);
    }
  }

  onFileSelected(file: File) {
    if (!isFrontendArchiveFile(file)) {
      toast.error('Select a .tar, .tar.gz, or .tgz frontend archive');
      return;
    }

    this.installErrorMessage.set(null);
    this.archiveFile.set(file);
  }

  async onInstall() {
    const file = this.archiveFile();
    if (file) {
      this.installErrorMessage.set(null);
      try {
        const files = await extractFrontendArchive(file);
        this.#uploadService.clear();
        for (const entry of files) {
          const asset = new File(
            [uint8ArrayToArrayBuffer(entry.bytes)],
            entry.fileName,
          );
          await this.#uploadService.add({ file: asset, path: entry.path });
        }
      } catch (error) {
        console.error(error);
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to read frontend archive';
        this.installErrorMessage.set(message);
        toast.error(message);
      }
    }
  }

  onOwnershipTaken() {
    this.#uploadService.reloadPermissions();
  }
}

function isFrontendArchiveFile(file: File): boolean {
  return (
    file.name.endsWith('.tar') ||
    file.name.endsWith('.tar.gz') ||
    file.name.endsWith('.tgz')
  );
}
