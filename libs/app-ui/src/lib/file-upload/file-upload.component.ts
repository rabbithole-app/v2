import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideFile,
  lucideFileArchive,
  lucideFileSpreadsheet,
  lucideFileText,
  lucideHeadphones,
  lucideImage,
  lucideTrash2,
  lucideUpload,
  lucideVideo,
  lucideX,
} from '@ng-icons/lucide';
import { hlm } from '@spartan-ng/brain/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { ClassValue } from 'clsx';

import { FileIconPipe } from './file-icon.pipe';
import { RbthFileUploadDropzoneComponent } from './file-upload-dropzone.component';
import { FileWithPreview } from './file-upload.model';
import { FileUploadService } from './file-upload.service';
import { injectFileUploadConfig } from './file-upload.token';
import { FormatBytesPipe } from './format-bytes.pipe';
@Component({
  selector: 'rbth-file-upload',
  imports: [
    NgIcon,
    HlmButton,
    HlmIcon,
    FormatBytesPipe,
    FileIconPipe,
    RbthFileUploadDropzoneComponent,
  ],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideFile,
      lucideFileArchive,
      lucideFileSpreadsheet,
      lucideFileText,
      lucideHeadphones,
      lucideImage,
      lucideVideo,
      lucideX,
      lucideTrash2,
      lucideUpload,
    }),
  ],
  templateUrl: './file-upload.component.html',
  host: {
    '[class]': 'computedClass()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthFileUploadComponent {
  disabled = input(false, { transform: booleanAttribute });
  fileUploadService = inject(FileUploadService);
  immediately = input(false);
  upload = output<FileWithPreview[]>();
  readonly userClass = input<ClassValue>('');
  protected readonly computedClass = computed(() =>
    hlm('flex flex-col gap-2', this.userClass()),
  );
  protected config = injectFileUploadConfig();

  handleUpload() {
    const files = this.fileUploadService.files();
    this.upload.emit(files);
    this.fileUploadService.clearFiles();
  }
}
