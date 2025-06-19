import { booleanAttribute, computed, Directive, input } from '@angular/core';
import { hlm } from '@spartan-ng/brain/core';
import {
  type ButtonVariants,
  buttonVariants,
  HlmButtonDirective,
} from '@spartan-ng/ui-button-helm';
import { cva, VariantProps } from 'class-variance-authority';
import { ClassValue } from 'clsx';

const sidebarMenuButtonVariants = cva(
  'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 group-data-[collapsible=]:justify-start max-md:justify-start',
  {
    variants: {
      variant: {
        default: 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        outline:
          'bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]',
      },
      size: {
        default: 'h-8 text-sm',
        sm: 'h-7 text-xs',
        lg: 'h-12 text-sm group-data-[collapsible=icon]:p-0!',
      },
    },
    compoundVariants: [
      {
        variant: ['default', 'outline'],
        class: '',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export type SidebarMenuButtonVariants = VariantProps<
  typeof sidebarMenuButtonVariants
>;

@Directive({
  selector: '[rbthSidebarMenuButton]',
  exportAs: 'rbthSidebarMenuButton',
  host: {
    '[class]': 'computedClass()',
    'data-sidebar': 'menu-button',
    '[attr.data-size]': 'size()',
    '[attr.data-active]': 'isActive()',
  },
  hostDirectives: [
    {
      directive: HlmButtonDirective,
      inputs: ['variant', 'size'],
    },
  ],
})
export class RbthSidebarMenuButtonDirective {
  isActive = input(false, { transform: booleanAttribute });
  size = input<NonNullable<ButtonVariants['size']>>('default');

  readonly userClass = input<ClassValue>('', { alias: 'class' });

  variant = input<NonNullable<ButtonVariants['variant']>>('default');

  protected readonly computedClass = computed(() => {
    const props = { variant: this.variant(), size: this.size() };
    return hlm(
      buttonVariants(props),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sidebarMenuButtonVariants(props as any),
      this.userClass()
    );
  });
}
