import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTag } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';

import { HlmButton } from '@spartan-ng/helm/button';
import { HlmButtonGroup } from '@spartan-ng/helm/button-group';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

import { DiscountService } from '../../services/discount.service';

@Component({
  selector: 'rbth-core-promo-code-input',
  imports: [HlmButton, HlmButtonGroup, HlmIcon, HlmInput, HlmSpinner, NgIcon],
  providers: [provideIcons({ lucideTag })],
  templateUrl: './promo-code-input.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class PromoCodeInputComponent {
  protected readonly _code = signal('');
  protected readonly _submitting = signal(false);
  protected readonly _canApply = computed(
    () => this._code().trim().length > 0 && !this._submitting(),
  );
  protected readonly _error = signal<string | null>(null);
  protected readonly _expanded = signal(false);

  readonly #discountService = inject(DiscountService);

  protected async _apply(): Promise<void> {
    if (!this._canApply()) return;

    this._submitting.set(true);
    this._error.set(null);

    try {
      const result = await this.#discountService.applyPromoCode(this._code());
      if (result.ok) {
        if (result.tone === 'info') {
          toast.info(result.message);
        } else {
          toast.success(result.message);
        }
        this._expanded.set(false);
        this._code.set('');
      } else {
        this._error.set(result.message);
      }
    } catch {
      this._error.set('Could not apply the code. Try again.');
    } finally {
      this._submitting.set(false);
    }
  }

  protected _onInput(value: string): void {
    this._code.set(value);
    this._error.set(null);
  }

  protected _toggle(): void {
    this._expanded.update((v) => !v);
  }
}
