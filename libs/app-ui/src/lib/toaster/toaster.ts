import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  numberAttribute,
} from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import type { ClassValue } from 'clsx';
import { NgxSonnerToaster, type ToasterProps } from 'ngx-sonner';

@Component({
  selector: 'rbth-toaster',
  imports: [NgxSonnerToaster, HlmSpinner],
  template: `
    <ngx-sonner-toaster
      [class]="_computedClass()"
      [invert]="invert()"
      [theme]="theme()"
      [position]="position()"
      [hotKey]="hotKey()"
      [richColors]="richColors()"
      [expand]="expand()"
      [duration]="duration()"
      [visibleToasts]="visibleToasts()"
      [closeButton]="closeButton()"
      [toastOptions]="toastOptions()"
      [offset]="offset()"
      [dir]="dir()"
      [style]="userStyle()"
      ><hlm-spinner class="size-4" loading-icon
    /></ngx-sonner-toaster>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthToaster {
  public readonly closeButton = input<
    ToasterProps['closeButton'],
    boolean | string
  >(false, {
    transform: booleanAttribute,
  });
  public readonly dir = input<ToasterProps['dir']>('auto');
  public readonly duration = input<ToasterProps['duration'], number | string>(
    4000,
    {
      transform: numberAttribute,
    },
  );
  public readonly expand = input<ToasterProps['expand'], boolean | string>(
    false,
    {
      transform: booleanAttribute,
    },
  );
  public readonly hotKey = input<ToasterProps['hotkey']>(['altKey', 'KeyT']);
  public readonly invert = input<ToasterProps['invert'], boolean | string>(
    false,
    {
      transform: booleanAttribute,
    },
  );
  public readonly offset = input<ToasterProps['offset']>(null);
  public readonly position = input<ToasterProps['position']>('bottom-right');
  public readonly richColors = input<
    ToasterProps['richColors'],
    boolean | string
  >(false, {
    transform: booleanAttribute,
  });
  public readonly theme = input<ToasterProps['theme']>('light');
  public readonly toastOptions = input<ToasterProps['toastOptions']>({
    classes: {
      toast:
        'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
      description: 'group-[.toast]:text-muted-foreground',
      actionButton:
        'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
      cancelButton:
        'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
    },
  });
  public readonly userClass = input<ClassValue>('', { alias: 'class' });
  public readonly userStyle = input<Record<string, string>>(
    {},
    // eslint-disable-next-line @angular-eslint/no-input-rename
    { alias: 'style' },
  );
  public readonly visibleToasts = input<
    ToasterProps['visibleToasts'],
    number | string
  >(3, {
    transform: numberAttribute,
  });

  protected readonly _computedClass = computed(() =>
    hlm('toaster group', this.userClass()),
  );
}
