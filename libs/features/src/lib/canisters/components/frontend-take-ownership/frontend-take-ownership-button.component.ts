import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { ClassValue } from 'clsx';
import { toast } from 'ngx-sonner';

import { injectAssetManager } from '@rabbithole/core';
import { parseCanisterRejectError } from '@rabbithole/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { hlm } from '@spartan-ng/helm/utils';

@Component({
  selector: 'rbth-feat-canisters-frontend-take-ownership-button',
  imports: [HlmButtonImports, HlmSpinnerImports],
  template: `
    <button
      [class]="_computedClass()"
      hlmBtn
      [disabled]="isTakingOwnership()"
      (click)="takeOwnership()"
    >
      @if (isTakingOwnership()) {
        <hlm-spinner class="size-4" />
        <span>Taking ownership...</span>
      } @else {
        Take Ownership
      }
    </button>
  `,
  host: {
    class: 'content',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FrontendTakeOwnershipButtonComponent {
  readonly isTakingOwnership = signal(false);
  readonly ownershipTaken = output<void>();
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected _computedClass = computed(() => hlm('', this.userClass()));

  #assetManager = injectAssetManager();

  async takeOwnership() {
    this.isTakingOwnership.set(true);
    const id = toast.loading('Taking ownership...');
    const assetManager = this.#assetManager();

    try {
      await assetManager.takeOwnership();
      toast.success('Ownership taken successfully', { id });
      this.ownershipTaken.emit();
    } catch (err) {
      const errorMessage =
        parseCanisterRejectError(err) ?? 'An error has occurred';
      toast.error(errorMessage, { id });
    } finally {
      this.isTakingOwnership.set(false);
    }
  }
}
