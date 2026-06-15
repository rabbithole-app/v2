import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ClassValue } from 'clsx';

import { hlm } from '@spartan-ng/helm/utils';

const SAFARI_WIDTH = 1203;
const SAFARI_HEIGHT = 753;
const SCREEN_X = 1;
const SCREEN_Y = 52;
const SCREEN_WIDTH = 1200;
const SCREEN_HEIGHT = 700;

const LEFT_PCT = (SCREEN_X / SAFARI_WIDTH) * 100;
const TOP_PCT = (SCREEN_Y / SAFARI_HEIGHT) * 100;
const WIDTH_PCT = (SCREEN_WIDTH / SAFARI_WIDTH) * 100;
const HEIGHT_PCT = (SCREEN_HEIGHT / SAFARI_HEIGHT) * 100;

@Component({
  selector: 'rbth-safari',
  imports: [NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'computedClass()',
    '[style.aspect-ratio]': `'${SAFARI_WIDTH}/${SAFARI_HEIGHT}'`,
  },
  templateUrl: './safari.component.html',
})
export class RbthSafari {
  readonly heightPct = HEIGHT_PCT;
  readonly imageSrc = input<string>();
  readonly leftPct = LEFT_PCT;
  readonly mode = input<'default' | 'simple'>('default');

  readonly topPct = TOP_PCT;
  readonly url = input<string>('');
  readonly userClass = input<ClassValue>('', { alias: 'class' });
  readonly widthPct = WIDTH_PCT;

  protected readonly computedClass = computed(() =>
    hlm('relative inline-block w-full align-middle leading-none', this.userClass()),
  );
}
