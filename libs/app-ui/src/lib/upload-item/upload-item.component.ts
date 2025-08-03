import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleAlert,
  lucideFile,
  lucideFileArchive,
  lucideFileSpreadsheet,
  lucideFileText,
  lucideHeadphones,
  lucideImage,
  lucideRotateCcw,
  lucideTrash2,
  lucideTriangleAlert,
  lucideUpload,
  lucideVideo,
  lucideX,
} from '@ng-icons/lucide';
import { hlm } from '@spartan-ng/brain/core';
import { BrnProgress, BrnProgressIndicator } from '@spartan-ng/brain/progress';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { ClassValue } from 'clsx';

import {
  FileIconPipe,
  FormatBytesPipe,
  FormatRangeBytesPipe,
} from '../file-upload';
import {
  RbthProgressDirective,
  RbthProgressIndicatorDirective,
} from '../progress';
import { RbthTooltipTriggerDirective } from '../tooltip';
import { FileUploadWithStatus } from '@rabbithole/core';

@Component({
  selector: 'rbth-upload-item',
  imports: [
    HlmSpinner,
    NgIcon,
    HlmButton,
    HlmIcon,
    FormatBytesPipe,
    FileIconPipe,
    BrnProgress,
    BrnProgressIndicator,
    RbthProgressDirective,
    RbthProgressIndicatorDirective,
    NgTemplateOutlet,
    RbthTooltipTriggerDirective,
    FormatRangeBytesPipe,
  ],
  templateUrl: './upload-item.component.html',
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
      lucideCheck,
      // lucideFileWarning,
      lucideRotateCcw,
      // lucideTrash,
      lucideTriangleAlert,
    }),
  ],
  host: {
    '[class]': '_computedClass()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthUploadItemComponent {
  cancelUpload = output();
  data = input.required<FileUploadWithStatus>();
  progress = computed(() => {
    const data = this.data();

    return data.status === 'processing'
      ? Math.round((data.current / data.total) * 100)
      : null;
  });
  removeUpload = output();
  retryUpload = output();
  showProgress = computed(() =>
    ['calchash', 'commit', 'pending', 'processing'].includes(
      this.data().status,
    ),
  );

  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected _computedClass = computed(() =>
    hlm(
      'flex w-full flex-col gap-4 rounded-2xl border border-stroke-soft-200 p-3',
      this.userClass(),
    ),
  );
}
