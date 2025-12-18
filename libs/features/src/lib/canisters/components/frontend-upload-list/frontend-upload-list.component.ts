import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { FrontendUploadItemComponent } from '../frontend-upload-item/frontend-upload-item.component';
import { FileUploadWithStatus } from '@rabbithole/core';

@Component({
  selector: 'core-frontend-upload-list',
  imports: [FrontendUploadItemComponent],
  template: `
    <h3 class="text-sm font-medium">Files to upload</h3>
    <div class="snap-y snap-mandatory max-h-96 overflow-y-auto">
      @for (item of items(); track item.id) {
        <core-frontend-upload-item [data]="item" />
      }
    </div>
  `,
  host: {
    class: 'space-y-2',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FrontendUploadListComponent {
  items = input.required<FileUploadWithStatus[]>();
}
