import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import {
  NgIcon,
  provideNgIconLoader,
  provideNgIconsConfig,
  withCaching,
} from '@ng-icons/core';
import { hlm } from '@spartan-ng/helm/utils';
import type { ClassValue } from 'clsx';

import { FILE_LIST_ICONS_CONFIG } from '../../tokens';

@Component({
  selector: 'rbth-feat-file-list-icon',
  template: `<ng-icon [name]="iconName()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [NgIcon],
  providers: [
    provideNgIconsConfig({
      size: '4em',
    }),
    provideNgIconLoader((name) => {
      const http = inject(HttpClient);
      const config = inject(FILE_LIST_ICONS_CONFIG);
      return http.get(`/${config.path}${name}.svg`, { responseType: 'text' });
    }, withCaching()),
  ],
  host: {
    '[class]': '_computedClass()',
  },
})
export class FileIconComponent {
  extension = input.required<string>();
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  protected readonly _computedClass = computed(() =>
    hlm('inline-flex', this.userClass()),
  );

  #config = inject(FILE_LIST_ICONS_CONFIG);

  protected readonly iconName = computed(() => {
    const ext = this.extension().toLowerCase();
    const config = this.#config.value;

    for (const [iconType, extensions] of Object.entries(config)) {
      if (extensions.includes(ext)) {
        return iconType;
      }
    }

    return 'unknown';
  });
}
