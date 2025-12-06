import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideFile, lucideTriangleAlert } from '@ng-icons/lucide';
import { BrnProgress, BrnProgressIndicator } from '@spartan-ng/brain/progress';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { hlm } from '@spartan-ng/helm/utils';
import { ClassValue } from 'clsx';

import { FileUploadWithStatus, UploadState } from '../../../types';
import { FormatBytesPipe, FormatRangeBytesPipe } from '../../ui';
import { RbthTooltipTriggerDirective } from '@rabbithole/ui';

@Component({
  selector: 'core-frontend-upload-item',
  imports: [
    HlmSpinner,
    NgIcon,
    HlmButton,
    HlmIcon,
    FormatBytesPipe,
    BrnProgress,
    BrnProgressIndicator,
    NgTemplateOutlet,
    RbthTooltipTriggerDirective,
    FormatRangeBytesPipe,
  ],
  templateUrl: './frontend-upload-item.component.html',
  providers: [
    provideIcons({
      lucideFile,
      lucideCheck,
      lucideTriangleAlert,
    }),
  ],
  host: {
    '[class]': '_computedClass()',
    '[class.text-destructive]': 'data().status === uploadState.FAILED',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FrontendUploadItemComponent {
  data = input.required<FileUploadWithStatus>();
  progress = computed(() => {
    const data = this.data();

    return data.status === UploadState.IN_PROGRESS
      ? Math.round((data.current / data.total) * 100)
      : data.status === UploadState.FINALIZING
        ? 100
        : null;
  });
  showProgress = computed(() =>
    [
      UploadState.FINALIZING,
      UploadState.IN_PROGRESS,
      UploadState.INITIALIZING,
      UploadState.NOT_STARTED,
      // UploadState.REQUESTING_VETKD,
    ].includes(this.data().status),
  );
  readonly uploadState = UploadState;

  public readonly userClass = input<ClassValue>('', { alias: 'class' });

  protected _computedClass = computed(() =>
    hlm('snap-start flex items-center gap-1.5', this.userClass()),
  );
}
