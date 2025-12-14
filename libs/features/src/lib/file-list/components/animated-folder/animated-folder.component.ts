import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { hlm } from '@spartan-ng/helm/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ClassValue } from 'clsx';

import { FOLDER_COLORS } from '../../constants';
import { DirectoryColor } from '../../types';

export const folderCoverVariants = cva(
  'absolute inset-0 w-full h-full [backface-visibility:hidden] [transform-origin:50%_100%] [transform-style:preserve-3d] transition-transform',
  {
    variants: {
      active: {
        true: '[-webkit-transform:rotateX(-30deg)] [transform:rotateX(-30deg)] duration-300 [transition-timing-function:cubic-bezier(0.1,1,0.3,1)]',
        false: 'duration-[600ms] delay-[100ms] ease-linear',
      },
    },
    defaultVariants: {
      active: false,
    },
  },
);

export type FolderCoverVariants = VariantProps<typeof folderCoverVariants>;

@Component({
  selector: 'rbth-feat-file-list-animated-folder',
  templateUrl: './animated-folder.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  host: {
    '[class]': '_computedClass()',
    '[class.active]': 'active()',
  },
})
export class AnimatedFolderComponent {
  active = input(false);
  public readonly color = input<DirectoryColor>('blue');
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    hlm('relative z-1 w-20', this.userClass()),
  );

  protected readonly coverClass = computed(() =>
    hlm(folderCoverVariants({ active: this.active() })),
  );

  getBackColor(): string {
    return FOLDER_COLORS[this.color()].back;
  }

  getCoverColor(): string {
    return FOLDER_COLORS[this.color()].cover;
  }
}
