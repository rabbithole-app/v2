import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCloud, lucideKeyRound } from '@ng-icons/lucide';

import type { ExternalStorageTargetView } from '@rabbithole/declarations/encrypted-storage';
import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmIcon } from '@spartan-ng/helm/icon';

import {
  nanosToDate,
  s3Config,
  targetLabel,
  targetStatusLabel,
  targetStatusVariant,
} from '../../utils';

@Component({
  selector: 'rbth-feat-current-target-frame',
  templateUrl: './current-target-frame.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgIcon,
    HlmBadge,
    HlmIcon,
    ...HlmButtonImports,
    ...HlmCardImports,
  ],
  providers: [provideIcons({ lucideCloud, lucideKeyRound })],
})
export class CurrentTargetFrameComponent {
  readonly edit = output<ExternalStorageTargetView>();

  readonly target = input.required<ExternalStorageTargetView>();

  protected readonly _config = computed(() => s3Config(this.target()));
  protected readonly _label = computed(() => targetLabel(this.target()));
  protected readonly _statusLabel = computed(() =>
    targetStatusLabel(this.target().status),
  );
  protected readonly _statusVariant = computed(() =>
    targetStatusVariant(this.target().status),
  );
  protected readonly _updatedAt = computed(() =>
    nanosToDate(this.target().updatedAt),
  );
  protected readonly _validatedAt = computed(() => {
    const validatedAt = this.target().lastValidatedAt[0];
    return validatedAt !== undefined ? nanosToDate(validatedAt) : null;
  });
}
