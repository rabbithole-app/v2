import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideDownload, lucideGithub } from '@ng-icons/lucide';
import { isTauri } from '@tauri-apps/api/core';

import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';

import { APP_NAME_TOKEN } from '../../../tokens';

@Component({
  selector: 'core-login-wrapper',
  imports: [NgIcon, HlmButton, HlmIcon],
  providers: [provideIcons({ lucideGithub, lucideDownload })],
  templateUrl: './login-wrapper.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'relative grid h-dvh w-full place-items-center overflow-hidden before:absolute before:start-1/2 before:top-0 before:-z-[1] before:size-full before:-translate-x-1/2 before:transform before:bg-[url(/squared-bg-element.svg)] before:bg-center before:bg-no-repeat dark:before:bg-[url(/squared-bg-element.svg)]',
  },
})
export class LoginWrapperComponent {
  readonly appName = inject(APP_NAME_TOKEN);
  readonly isTauri = isTauri();
}
