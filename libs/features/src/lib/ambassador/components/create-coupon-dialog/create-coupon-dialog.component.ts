import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import {
  BrnDialogClose,
  BrnDialogRef,
  injectBrnDialogContext,
} from '@spartan-ng/brain/dialog';

import { dateToTimeInNanos, formatDiscountPercent } from '@rabbithole/core';
import type { CreateCouponArgs } from '@rabbithole/declarations/backend';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmDatePickerImports } from '@spartan-ng/helm/date-picker';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@spartan-ng/helm/dialog';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmIconImports } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmInputGroupImports } from '@spartan-ng/helm/input-group';
import { HlmToggleGroupImports } from '@spartan-ng/helm/toggle-group';

export interface CreateCouponDialogContext {
  discountBps: bigint;
}

const MAX_NOTE_LENGTH = 64;

type CouponUsage = 'custom' | 'multi' | 'single';

@Component({
  selector: 'rbth-feat-create-coupon-dialog',
  imports: [
    BrnDialogClose,
    HlmButton,
    HlmDialogHeader,
    HlmDialogFooter,
    HlmDialogTitle,
    HlmDialogDescription,
    HlmInput,
    ...HlmToggleGroupImports,
    ...HlmFieldImports,
    ...HlmDatePickerImports,
    ...HlmInputGroupImports,
    ...HlmIconImports,
  ],
  providers: [provideIcons({ lucideX })],
  templateUrl: './create-coupon-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateCouponDialogComponent {
  protected readonly customCount = signal(10);
  protected readonly usage = signal<CouponUsage>('multi');

  protected readonly canCreate = computed(
    () =>
      this.usage() !== 'custom' ||
      (Number.isInteger(this.customCount()) && this.customCount() >= 1),
  );
  readonly #context = injectBrnDialogContext<CreateCouponDialogContext>();

  protected readonly discountLabel = formatDiscountPercent(
    this.#context?.discountBps ?? 1000n,
  );
  protected readonly expiresAt = signal<Date | undefined>(undefined);
  protected readonly maxNoteLength = MAX_NOTE_LENGTH;
  protected readonly minDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

  protected readonly note = signal('');

  readonly #dialogRef = inject(BrnDialogRef);

  protected clearDate(): void {
    this.expiresAt.set(undefined);
  }

  protected create(): void {
    if (!this.canCreate()) return;
    const expiry = this.expiresAt();
    const note = this.note().trim().slice(0, MAX_NOTE_LENGTH);
    const usage = this.usage();
    const maxRedemptions: [] | [bigint] =
      usage === 'single'
        ? [1n]
        : usage === 'custom'
          ? [BigInt(this.customCount())]
          : [];
    const args: CreateCouponArgs = {
      maxRedemptions,
      expiresAt: expiry ? [dateToTimeInNanos(expiry)] : [],
      note: note ? [note] : [],
    };
    this.#dialogRef.close(args);
  }

  protected onCustomCountInput(value: string): void {
    this.customCount.set(Number(value));
  }

  protected onDateChange(date: Date | undefined): void {
    this.expiresAt.set(date);
  }

  protected onNoteInput(value: string): void {
    this.note.set(value);
  }

  protected selectUsage(value: CouponUsage | CouponUsage[] | null | undefined): void {
    const s = Array.isArray(value) ? value[0] : value;
    if (s) this.usage.set(s);
  }
}
