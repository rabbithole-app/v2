import { FocusableOption, Highlightable } from '@angular/cdk/a11y';
import { booleanAttribute, ElementRef, signal } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ClassValue } from 'clsx';

import { ENCRYPTED_STORAGE_CANISTER_ID, IS_PRODUCTION_TOKEN } from '@rabbithole/core';
import { hlm } from '@spartan-ng/helm/utils';

import { isDirectory, isFile, NodeItem } from '../../types';
import { AnimatedFolderComponent } from '../animated-folder/animated-folder.component';
import { FileIconComponent } from '../file-icon/file-icon.component';

export const gridItemVariants = cva(
  'grid gap-y-2 grid-rows-[1fr_36px] items-start p-3 select-none transition-colors duration-100 ease-in-out rounded-lg cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
  {
    variants: {
      selected: {
        true: 'ring-2 ring-primary bg-muted',
        false: '',
      },
      highlighted: {
        true: 'ring-2 ring-primary ring-offset-2',
        false: '',
      },
      active: {
        true: 'border-2 border-dashed border-sky-500 bg-sky-50/50 dark:bg-sky-950/20',
        false: '',
      },
    },
    defaultVariants: {
      selected: false,
      highlighted: false,
      active: false,
    },
  },
);

export type GridItemVariants = VariantProps<typeof gridItemVariants>;

@Component({
  selector: 'rbth-feat-file-list-grid-item',
  templateUrl: './grid-item.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AnimatedFolderComponent, FileIconComponent],
  host: {
    '[class]': '_computedClass()',
    '[tabindex]': 'data().disabled ? -1 : 0',
    '[attr.role]': '"gridcell"',
    '[attr.aria-selected]': 'selected()',
    '[attr.aria-label]': 'itemName()',
    '[attr.id]': '_itemId()',
    '[attr.aria-disabled]': '_disabled()',
  },
  styles: [
    `
      :host.cdk-drop-list-dragging {
        @apply border-2 border-dashed border-sky-500 bg-sky-50/50 dark:bg-sky-950/20;
      }
      :host.cdk-drag-preview {
        @apply box-border rounded shadow-[0_5px_5px_-3px_rgba(0,0,0,0.2),0_8px_10px_1px_rgba(0,0,0,0.14),0_3px_14px_2px_rgba(0,0,0,0.12)];
      }
      :host.cdk-drag-animating {
        @apply transition-transform duration-[250ms] ease-[cubic-bezier(0,0,0.2,1)];
      }
      :host.cdk-drag-placeholder {
        @apply opacity-0;
      }
      :host.cdk-drag-dragging {
        @apply z-1;
      }
    `,
  ],
})
export class GridItemComponent implements FocusableOption, Highlightable {
  _disabled = input(false, { transform: booleanAttribute, alias: 'disabled' });
  active = input(false, { transform: booleanAttribute });
  data = input.required<NodeItem>();
  element = inject(ElementRef);
  loading = input(false, { transform: booleanAttribute });
  selected = input(false, { transform: booleanAttribute });
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected readonly highlighted = signal(false);

  protected readonly _computedClass = computed(() =>
    hlm(
      gridItemVariants({
        selected: this.selected(),
        highlighted: this.highlighted(),
        active: this.active(),
      }),
      this.userClass(),
    ),
  );

  protected readonly _itemId = computed(() => {
    const item = this.data();
    return `grid-item-${item.id.toString()}`;
  });

  protected readonly directoryColor = computed(() => {
    const item = this.data();
    return isDirectory(item) ? (item.color ?? 'blue') : 'blue';
  });

  protected readonly fileExtension = computed(() => {
    const item = this.data();
    if (isFile(item)) {
      const parts = item.name.split('.');
      return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
    }
    return '';
  });

  protected readonly hasThumbnail = computed(() => {
    const item = this.data();
    return isFile(item) && !!item.thumbnailKey;
  });

  protected readonly isDirectoryNode = computed(() => isDirectory(this.data()));
  protected readonly isFileNode = computed(() => isFile(this.data()));

  protected readonly itemName = computed(() => this.data().name);

  protected readonly thumbnailUrl = computed(() => {
    const item = this.data();
    if (isFile(item) && item.thumbnailKey) {
      const storageUrl = this.#isProduction
        ? `https://${this.#canisterId.toText()}.icp0.io`
        : `https://${this.#canisterId.toText()}.localhost`;
      return `${storageUrl}${item.thumbnailKey}`;
    }
    return null;
  });

  #canisterId = inject(ENCRYPTED_STORAGE_CANISTER_ID);

  #elementRef = inject(ElementRef<HTMLElement>);

  readonly #isProduction = inject(IS_PRODUCTION_TOKEN);

  focus(): void {
    this.#elementRef.nativeElement.focus();
  }

  getLabel(): string {
    return this.itemName();
  }

  setActiveStyles(): void {
    this.highlighted.set(true);
  }

  setInactiveStyles(): void {
    this.highlighted.set(false);
  }
}
