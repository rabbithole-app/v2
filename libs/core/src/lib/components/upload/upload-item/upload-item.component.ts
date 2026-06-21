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
import { BrnProgress, BrnProgressIndicator } from '@spartan-ng/brain/progress';

import {
  RbthProgressDirective,
  RbthProgressIndicatorDirective,
} from '@rabbithole/ui/progress';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmHoverCardImports } from '@spartan-ng/helm/hover-card';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmItemImports } from '@spartan-ng/helm/item';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import { FileUploadWithStatus, UploadState } from '../../../types';
import { getUploadFailureCopy } from '../../../utils/upload-failure-copy';
import { FileIconPipe, FormatBytesPipe, FormatRangeBytesPipe } from '../../ui';

@Component({
  selector: 'rbth-core-upload-item',
  imports: [
    HlmSpinner,
    NgIcon,
    HlmButton,
    HlmIcon,
    ...HlmAlertImports,
    ...HlmHoverCardImports,
    ...HlmItemImports,
    FormatBytesPipe,
    FileIconPipe,
    BrnProgress,
    BrnProgressIndicator,
    RbthProgressDirective,
    RbthProgressIndicatorDirective,
    NgTemplateOutlet,
    FormatRangeBytesPipe,
    ...HlmTooltipImports,
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoreUploadItemComponent {
  cancelUpload = output();
  data = input.required<FileUploadWithStatus>();
  failureCopy = computed(() => {
    const data = this.data();

    return data.status === UploadState.FAILED
      ? getUploadFailureCopy(data.errorMessage)
      : null;
  });
  failureTechnicalDetails = computed(() => {
    const failure = this.failureCopy();

    return failure?.technicalDetails &&
      failure.technicalDetails !== failure.description
      ? failure.technicalDetails
      : null;
  });
  progress = computed(() => {
    const data = this.data();

    if (
      data.status === UploadState.IN_PROGRESS ||
      data.status === UploadState.WAITING_FOR_FUNDING
    ) {
      return uploadProgressPercent(data.current, data.total);
    }

    return data.status === UploadState.FINALIZING ? 100 : null;
  });
  removeUpload = output();
  retryUpload = output();
  showProgress = computed(() =>
    [
      UploadState.FINALIZING,
      UploadState.IN_PROGRESS,
      UploadState.INITIALIZING,
      UploadState.NOT_STARTED,
      UploadState.PREPARING,
      UploadState.REQUESTING_VETKD,
      UploadState.WAITING_FOR_FUNDING,
    ].includes(this.data().status),
  );
  statusLabel = computed(() => uploadStatusText(this.data()));
  readonly uploadState = UploadState;
}

function uploadProgressPercent(current: number, total: number): number {
  if (total <= 0) return 0;

  return Math.min(100, Math.max(0, Math.round((current / total) * 100)));
}

function uploadStatusText(data: FileUploadWithStatus): string {
  switch (data.status) {
    case UploadState.COMPLETED:
      return 'Completed';
    case UploadState.FAILED:
      return 'Upload failed';
    case UploadState.FINALIZING:
      return 'Finalizing...';
    case UploadState.INITIALIZING:
      return 'Initializing...';
    case UploadState.NOT_STARTED:
      return 'Pending...';
    case UploadState.PREPARING:
      return 'Preparing...';
    case UploadState.REQUESTING_VETKD:
      return 'Requesting vetKeys...';
    case UploadState.WAITING_FOR_FUNDING:
      return waitingForFundingStatusText(data.message);
    default:
      return 'Uploading...';
  }
}

function waitingForFundingStatusText(message = ''): string {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('top-up is already in progress') ||
    normalized.includes('could not perform self call') ||
    normalized.includes('storage funding is already in progress') ||
    normalized.includes('auto top-up is already in progress')
  ) {
    return 'Storage update...';
  }

  if (
    normalized.includes('blob storage') ||
    normalized.includes('cashier')
  ) {
    return 'Storage setup...';
  }

  return 'Waiting for cycles...';
}
