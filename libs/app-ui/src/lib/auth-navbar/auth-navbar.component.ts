import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  contentChild,
  signal,
  TemplateRef,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBookOpen, lucideGithub, lucideMenu, lucideX } from '@ng-icons/lucide';

import { HlmButtonImports } from '@spartan-ng/helm/button';

@Component({
  selector: 'rbth-auth-navbar',
  imports: [NgTemplateOutlet, RouterLink, NgIcon, ...HlmButtonImports],
  providers: [provideIcons({ lucideMenu, lucideX, lucideBookOpen, lucideGithub })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sticky top-0 z-50 block border-b border-border bg-muted/60 backdrop-blur-sm',
  },
  templateUrl: './auth-navbar.component.html',
})
export class RbthAuthNavbar {
  readonly ctaTpl = contentChild<TemplateRef<unknown>>('cta');
  readonly mobileMenuOpen = signal(false);

  toggleMenu(): void {
    this.mobileMenuOpen.update((v) => !v);
  }
}
