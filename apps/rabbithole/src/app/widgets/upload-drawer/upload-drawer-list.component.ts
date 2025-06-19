import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';

import { UploadService } from './upload.service';
import { FileUploadWithStatus, UploadFile } from '@rabbithole/core';
import { RbthUploadItemComponent } from '@rabbithole/ui';

@Component({
  selector: 'app-upload-drawer-list',
  imports: [RbthUploadItemComponent],
  template: `@for (item of items(); track item.id) {
    <rbth-upload-item
      [data]="item"
      (removeUpload)="handleRemove(item.id)"
      (cancelUpload)="handleCancel(item.id)"
      (retryUpload)="handleRetry(item.id)"
    />
  }`,
  host: {
    class: 'flex flex-col p-4 gap-4',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadDrawerListComponent {
  items = input.required<FileUploadWithStatus[]>();
  #uploadService = inject(UploadService);

  handleCancel(id: UploadFile['id']) {
    this.#uploadService.cancel(id);
  }

  handleRemove(id: UploadFile['id']) {
    this.#uploadService.remove(id);
  }

  handleRetry(id: UploadFile['id']) {
    this.#uploadService.retry(id);
  }
}
