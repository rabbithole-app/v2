import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideChevronUp } from '@ng-icons/lucide';
import { hlm } from '@spartan-ng/brain/core';
import { HlmIcon } from '@spartan-ng/helm/icon';
import {
  HeaderContext,
  injectFlexRenderContext,
  SortDirection,
} from '@tanstack/angular-table';
import { ClassValue } from 'clsx';
import { asyncScheduler } from 'rxjs';

@Component({
  imports: [NgIcon, HlmIcon],
  providers: [provideIcons({ lucideChevronDown, lucideChevronUp })],
  template: `
    {{ _header() }}
    @switch (direction()) {
      @case ('asc') {
        <ng-icon hlm class="ml-3" size="sm" name="lucideChevronUp" />
      }
      @case ('desc') {
        <ng-icon hlm class="ml-3" size="sm" name="lucideChevronDown" />
      }
    }
  `,
  host: {
    '(click)': 'filterClick()',
    '[class]': '_computedClass()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableHeadSortButton<T> {
  direction = signal<SortDirection | false>(false);
  readonly header = input('');
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected _computedClass = computed(() =>
    hlm(
      'flex h-full cursor-pointer items-center justify-between gap-2 select-none',
      this.userClass(),
    ),
  );
  protected readonly _context =
    injectFlexRenderContext<HeaderContext<T, unknown>>();
  protected readonly _header = computed(() => {
    return this.header() === '' ? this._context.column.id : this.header();
  });
  protected filterClick() {
    this._context.column.toggleSorting();
    asyncScheduler.schedule(() =>
      this.direction.set(this._context.column.getIsSorted()),
    );
  }
}
