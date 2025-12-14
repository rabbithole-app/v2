import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core';

import { UPLOAD_SERVICE_TOKEN } from '../../../tokens';
import { FileUploadWithStatus, UploadFile } from '../../../types';
import { CoreUploadItemComponent } from '../upload-item/upload-item.component';

@Component({
  selector: 'core-upload-drawer-list',
  imports: [CoreUploadItemComponent],
  template: `@for (item of items(); track item.id) {
    <core-upload-item
      [data]="item"
      (removeUpload)="handleRemove(item.id)"
      (cancelUpload)="handleCancel(item.id)"
      (retryUpload)="handleRetry(item.id)"
    />
  }`,
  host: {
    class: 'flex flex-col px-4 pb-4 pt-0 gap-4',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadDrawerListComponent {
  items = input.required<FileUploadWithStatus[]>();
  #uploadService = inject(UPLOAD_SERVICE_TOKEN);

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
