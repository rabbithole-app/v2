# Spartan UI Component Reference

Complete catalog of Spartan UI components with Angular usage patterns and installation.

## Installation

**Add specific components:**
```bash
npx @spartan-ng/cli@latest add button
npx @spartan-ng/cli@latest add button card dialog  # Multiple
```

Components install to `libs/ui/` in Nx monorepo with automatic dependency management.

**Installation location:**
Components are typically installed in `libs/ui/` in Nx monorepos. Import from `@spartan-ng/helm/*`.

## Form & Input Components

### Button
```typescript
import { HlmButtonImports } from '@spartan-ng/helm/button';

@Component({
  imports: [HlmButtonImports],
  template: `
    <button hlmBtn variant="default">Default</button>
    <button hlmBtn variant="destructive">Delete</button>
    <button hlmBtn variant="outline" size="sm">Small Outline</button>
    <button hlmBtn variant="ghost" size="icon"><ng-icon name="lucideX" /></button>
    <button hlmBtn variant="link">Link Style</button>
  `,
})
```

Variants: `default | destructive | outline | secondary | ghost | link`
Sizes: `default | sm | lg | icon | icon-sm | icon-lg`

### Input
```typescript
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';

@Component({
  imports: [HlmInputImports, HlmLabelImports],
  template: `
    <div class="space-y-2">
      <label hlmLabel for="email">Email</label>
      <input hlmInput id="email" type="email" placeholder="you@example.com" />
    </div>
  `,
})
```

### Form Field (with Reactive Forms)
```typescript
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HlmFormFieldImports } from '@spartan-ng/helm/form-field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmButtonImports } from '@spartan-ng/helm/button';

@Component({
  imports: [
    ReactiveFormsModule,
    HlmFormFieldImports,
    HlmInputImports,
    HlmLabelImports,
    HlmButtonImports,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-8">
      <brn-form-field>
        <label hlmLabel for="username">Username</label>
        <input hlmInput id="username" formControlName="username" placeholder="johndoe" />
        @if (form.controls.username.hasError('required') && form.controls.username.touched) {
          <p class="text-sm text-destructive mt-1">Username is required</p>
        }
        @if (form.controls.username.hasError('minlength') && form.controls.username.touched) {
          <p class="text-sm text-destructive mt-1">Min 2 characters</p>
        }
      </brn-form-field>

      <brn-form-field>
        <label hlmLabel for="email">Email</label>
        <input hlmInput id="email" type="email" formControlName="email" />
        @if (form.controls.email.hasError('email') && form.controls.email.touched) {
          <p class="text-sm text-destructive mt-1">Invalid email</p>
        }
      </brn-form-field>

      <button hlmBtn type="submit" [disabled]="form.invalid">Submit</button>
    </form>
  `,
})
export class ProfileFormComponent {
  private fb = inject(FormBuilder);

  readonly form = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
    email: ['', [Validators.required, Validators.email]],
  });

  onSubmit() {
    console.log(this.form.value);
  }
}
```

### Select
```typescript
import { HlmSelectImports } from '@spartan-ng/helm/select';

@Component({
  imports: [HlmSelectImports],
  template: `
    <brn-select [(ngModel)]="selectedTheme">
      <button hlmBtn variant="outline" class="w-[180px]">
        <span>{{ selectedTheme() || 'Theme' }}</span>
      </button>
      <brn-select-content hlm>
        <brn-select-item hlm value="light">Light</brn-select-item>
        <brn-select-item hlm value="dark">Dark</brn-select-item>
        <brn-select-item hlm value="system">System</brn-select-item>
      </brn-select-content>
    </brn-select>
  `,
})
export class ThemeSelectorComponent {
  readonly selectedTheme = signal<string>('');
}
```

### Checkbox
```typescript
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmLabelImports } from '@spartan-ng/helm/label';

@Component({
  imports: [HlmCheckboxImports, HlmLabelImports],
  template: `
    <div class="flex items-center space-x-2">
      <brn-checkbox hlm id="terms" [(ngModel)]="accepted" />
      <label hlmLabel for="terms">Accept terms</label>
    </div>
  `,
})
export class TermsComponent {
  readonly accepted = signal(false);
}
```

### Radio Group
```typescript
import { HlmRadioGroupImports } from '@spartan-ng/helm/radio-group';
import { HlmLabelImports } from '@spartan-ng/helm/label';

@Component({
  imports: [HlmRadioGroupImports, HlmLabelImports],
  template: `
    <brn-radio-group hlm [(ngModel)]="selectedOption">
      <div class="flex items-center space-x-2">
        <brn-radio hlm value="option-one" id="option-one" />
        <label hlmLabel for="option-one">Option One</label>
      </div>
      <div class="flex items-center space-x-2">
        <brn-radio hlm value="option-two" id="option-two" />
        <label hlmLabel for="option-two">Option Two</label>
      </div>
    </brn-radio-group>
  `,
})
export class RadioComponent {
  readonly selectedOption = signal('option-one');
}
```

### Textarea
```typescript
import { HlmTextareaImports } from '@spartan-ng/helm/textarea';

@Component({
  imports: [HlmTextareaImports],
  template: `
    <textarea hlmInput placeholder="Type your message here." rows="4"></textarea>
  `,
})
```

### Switch
```typescript
import { HlmSwitchImports } from '@spartan-ng/helm/switch';
import { HlmLabelImports } from '@spartan-ng/helm/label';

@Component({
  imports: [HlmSwitchImports, HlmLabelImports],
  template: `
    <div class="flex items-center space-x-2">
      <brn-switch hlm id="airplane-mode" [(ngModel)]="airplaneMode" />
      <label hlmLabel for="airplane-mode">Airplane Mode</label>
    </div>
  `,
})
export class SwitchComponent {
  readonly airplaneMode = signal(false);
}
```

### Date Picker
```typescript
import { HlmCalendarImports } from '@spartan-ng/helm/calendar';
import { HlmPopoverImports } from '@spartan-ng/helm/popover';
import { HlmButtonImports } from '@spartan-ng/helm/button';

@Component({
  imports: [HlmCalendarImports, HlmPopoverImports, HlmButtonImports],
  template: `
    <brn-popover>
      <button hlmBtn variant="outline" brnPopoverTrigger>
        <ng-icon name="lucideCalendar" class="mr-2 h-4 w-4" />
        {{ date() ? (date() | date:'mediumDate') : 'Pick a date' }}
      </button>
      <brn-popover-content hlm class="w-auto p-0">
        <brn-calendar hlm [(ngModel)]="date" />
      </brn-popover-content>
    </brn-popover>
  `,
})
export class DatePickerComponent {
  readonly date = signal<Date | null>(null);
}
```

## Layout & Navigation

### Card
```typescript
import { HlmCardImports } from '@spartan-ng/helm/card';

@Component({
  imports: [HlmCardImports],
  template: `
    <div hlmCard>
      <div hlmCardHeader>
        <h3 hlmCardTitle>Card Title</h3>
        <p hlmCardDescription>Card Description</p>
      </div>
      <div hlmCardContent>
        <p>Card Content</p>
      </div>
      <div hlmCardFooter>
        <button hlmBtn>Action</button>
      </div>
    </div>
  `,
})
```

### Tabs
```typescript
import { HlmTabsImports } from '@spartan-ng/helm/tabs';

@Component({
  imports: [HlmTabsImports],
  template: `
    <brn-tabs hlm defaultValue="account">
      <brn-tabs-list hlm>
        <button hlmTabsTrigger value="account">Account</button>
        <button hlmTabsTrigger value="password">Password</button>
      </brn-tabs-list>
      <div hlmTabsContent value="account">Account settings</div>
      <div hlmTabsContent value="password">Password settings</div>
    </brn-tabs>
  `,
})
```

### Accordion
```typescript
import { HlmAccordionImports } from '@spartan-ng/helm/accordion';

@Component({
  imports: [HlmAccordionImports],
  template: `
    <brn-accordion hlm>
      <brn-accordion-item hlm>
        <brn-accordion-trigger hlm>
          Is it accessible?
        </brn-accordion-trigger>
        <brn-accordion-content hlm>
          Yes. It adheres to WAI-ARIA design pattern.
        </brn-accordion-content>
      </brn-accordion-item>
      <brn-accordion-item hlm>
        <brn-accordion-trigger hlm>
          Is it styled?
        </brn-accordion-trigger>
        <brn-accordion-content hlm>
          Yes. Comes with default styles customizable with Tailwind.
        </brn-accordion-content>
      </brn-accordion-item>
    </brn-accordion>
  `,
})
```

### Navigation Menu
```typescript
import { HlmNavigationMenuImports } from '@spartan-ng/helm/navigation-menu';

@Component({
  imports: [HlmNavigationMenuImports],
  template: `
    <brn-navigation-menu hlm>
      <brn-navigation-menu-list hlm>
        <brn-navigation-menu-item hlm>
          <button hlmNavigationMenuTrigger>Getting Started</button>
          <brn-navigation-menu-content hlm>
            <a hlmNavigationMenuLink href="/intro">Introduction</a>
            <a hlmNavigationMenuLink href="/install">Installation</a>
          </brn-navigation-menu-content>
        </brn-navigation-menu-item>
      </brn-navigation-menu-list>
    </brn-navigation-menu>
  `,
})
```

### Sidebar
```typescript
import { HlmSidebarImports } from '@spartan-ng/helm/sidebar';

@Component({
  imports: [HlmSidebarImports],
  template: `
    <brn-sidebar>
      <div hlmSidebarContent class="p-4">
        <nav class="space-y-2">
          @for (item of navItems(); track item.id) {
            <a [href]="item.href" class="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent">
              <ng-icon [name]="item.icon" />
              {{ item.label }}
            </a>
          }
        </nav>
      </div>
    </brn-sidebar>
  `,
})
export class SidebarComponent {
  readonly navItems = signal([
    { id: 1, label: 'Dashboard', href: '/', icon: 'lucideHome' },
    { id: 2, label: 'Files', href: '/files', icon: 'lucideFolder' },
  ]);
}
```

## Overlays & Dialogs

### Dialog
```typescript
import { HlmDialogImports } from '@spartan-ng/helm/dialog';

@Component({
  imports: [HlmDialogImports],
  template: `
    <brn-dialog [state]="dialogState">
      <button hlmBtn brnDialogTrigger>Open</button>
      <brn-dialog-overlay hlm />
      <div hlmDialogContent>
        <div hlmDialogHeader>
          <h2 hlmDialogTitle>Are you sure?</h2>
          <p hlmDialogDescription>This action cannot be undone.</p>
        </div>
        <div hlmDialogFooter>
          <button hlmBtn variant="outline" (click)="closeDialog()">Cancel</button>
          <button hlmBtn (click)="confirm()">Confirm</button>
        </div>
      </div>
    </brn-dialog>
  `,
})
export class DialogComponent {
  readonly dialogState = signal<'open' | 'closed'>('closed');

  closeDialog() {
    this.dialogState.set('closed');
  }

  confirm() {
    console.log('Confirmed');
    this.dialogState.set('closed');
  }
}
```

### Sheet
```typescript
import { HlmSheetImports } from '@spartan-ng/helm/sheet';

@Component({
  imports: [HlmSheetImports],
  template: `
    <brn-sheet [state]="sheetState" side="right">
      <button hlmBtn brnSheetTrigger>Open Sheet</button>
      <div hlmSheetContent>
        <div hlmSheetHeader>
          <h2 hlmSheetTitle>Title</h2>
          <p hlmSheetDescription>Description</p>
        </div>
        <div class="py-4">
          Sheet content
        </div>
        <div hlmSheetFooter>
          <button hlmBtn (click)="closeSheet()">Close</button>
        </div>
      </div>
    </brn-sheet>
  `,
})
export class SheetComponent {
  readonly sheetState = signal<'open' | 'closed'>('closed');

  closeSheet() {
    this.sheetState.set('closed');
  }
}
```

### Popover
```typescript
import { HlmPopoverImports } from '@spartan-ng/helm/popover';

@Component({
  imports: [HlmPopoverImports],
  template: `
    <brn-popover>
      <button hlmBtn variant="outline" brnPopoverTrigger>Open</button>
      <brn-popover-content hlm>
        <div class="space-y-2">
          <p class="text-sm">Content here</p>
        </div>
      </brn-popover-content>
    </brn-popover>
  `,
})
```

### Toast (Sonner)
```typescript
import { inject } from '@angular/core';
import { HlmSonnerImports } from '@spartan-ng/helm/sonner';
import { toast } from 'ngx-sonner';

@Component({
  imports: [HlmSonnerImports],
  template: `
    <button hlmBtn (click)="showToast()">Show Toast</button>
    <hlm-toaster />
  `,
})
export class ToastComponent {
  showToast() {
    toast('Scheduled: Catch up', {
      description: 'Friday, February 10, 2023 at 5:57 PM',
    });
  }
}
```

### Command
```typescript
import { HlmCommandImports } from '@spartan-ng/helm/command';

@Component({
  imports: [HlmCommandImports],
  template: `
    <brn-command hlm>
      <input hlmCommandInput placeholder="Type a command or search..." />
      <div hlmCommandList>
        <div hlmCommandEmpty>No results found.</div>
        <div hlmCommandGroup heading="Suggestions">
          <button hlmCommandItem>Calendar</button>
          <button hlmCommandItem>Search Emoji</button>
          <button hlmCommandItem>Calculator</button>
        </div>
      </div>
    </brn-command>
  `,
})
```

### Alert Dialog
```typescript
import { HlmAlertDialogImports } from '@spartan-ng/helm/alert-dialog';

@Component({
  imports: [HlmAlertDialogImports],
  template: `
    <brn-alert-dialog [state]="alertState">
      <button hlmBtn variant="destructive" brnAlertDialogTrigger>Delete</button>
      <brn-alert-dialog-overlay hlm />
      <div hlmAlertDialogContent>
        <div hlmAlertDialogHeader>
          <h2 hlmAlertDialogTitle>Absolutely sure?</h2>
          <p hlmAlertDialogDescription>
            This permanently deletes your account and removes data from servers.
          </p>
        </div>
        <div hlmAlertDialogFooter>
          <button hlmBtn variant="outline" (click)="cancel()">Cancel</button>
          <button hlmBtn variant="destructive" (click)="continue()">Continue</button>
        </div>
      </div>
    </brn-alert-dialog>
  `,
})
export class AlertDialogComponent {
  readonly alertState = signal<'open' | 'closed'>('closed');

  cancel() {
    this.alertState.set('closed');
  }

  continue() {
    console.log('Continuing...');
    this.alertState.set('closed');
  }
}
```

## Feedback & Status

### Alert
```typescript
import { HlmAlertImports } from '@spartan-ng/helm/alert';

@Component({
  imports: [HlmAlertImports],
  template: `
    <div hlmAlert>
      <ng-icon hlmAlertIcon name="lucideInfo" />
      <h4 hlmAlertTitle>Heads up!</h4>
      <p hlmAlertDescription>You can add components using CLI.</p>
    </div>

    <div hlmAlert variant="destructive">
      <ng-icon hlmAlertIcon name="lucideAlertCircle" />
      <h4 hlmAlertTitle>Error</h4>
      <p hlmAlertDescription>Session expired. Please log in.</p>
    </div>
  `,
})
```

### Progress
```typescript
import { HlmProgressImports } from '@spartan-ng/helm/progress';

@Component({
  imports: [HlmProgressImports],
  template: `
    <brn-progress hlm [value]="progress()" />
  `,
})
export class ProgressComponent {
  readonly progress = signal(33);
}
```

### Skeleton
```typescript
import { HlmSkeletonImports } from '@spartan-ng/helm/skeleton';

@Component({
  imports: [HlmSkeletonImports],
  template: `
    <div class="flex items-center space-x-4">
      <div hlmSkeleton class="h-12 w-12 rounded-full"></div>
      <div class="space-y-2">
        <div hlmSkeleton class="h-4 w-[250px]"></div>
        <div hlmSkeleton class="h-4 w-[200px]"></div>
      </div>
    </div>
  `,
})
```

### Spinner
```typescript
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

@Component({
  imports: [HlmSpinnerImports],
  template: `
    <div hlmSpinner></div>
    <div hlmSpinner size="lg"></div>
  `,
})
```

### Badge
```typescript
import { HlmBadgeImports } from '@spartan-ng/helm/badge';

@Component({
  imports: [HlmBadgeImports],
  template: `
    <span hlmBadge>Default</span>
    <span hlmBadge variant="secondary">Secondary</span>
    <span hlmBadge variant="destructive">Destructive</span>
    <span hlmBadge variant="outline">Outline</span>
  `,
})
```

## Display Components

### Table
```typescript
import { HlmTableImports } from '@spartan-ng/helm/table';

@Component({
  imports: [HlmTableImports],
  template: `
    <table hlmTable>
      <caption hlmTableCaption>Recent invoices</caption>
      <thead hlmThead>
        <tr hlmTr>
          <th hlmTh>Invoice</th>
          <th hlmTh>Status</th>
          <th hlmTh>Amount</th>
        </tr>
      </thead>
      <tbody hlmTbody>
        @for (invoice of invoices(); track invoice.id) {
          <tr hlmTr>
            <td hlmTd>{{ invoice.number }}</td>
            <td hlmTd>{{ invoice.status }}</td>
            <td hlmTd>{{ invoice.amount | currency }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class TableComponent {
  readonly invoices = signal([
    { id: 1, number: 'INV001', status: 'Paid', amount: 250 },
    { id: 2, number: 'INV002', status: 'Pending', amount: 150 },
  ]);
}
```

### Avatar
```typescript
import { HlmAvatarImports } from '@spartan-ng/helm/avatar';

@Component({
  imports: [HlmAvatarImports],
  template: `
    <span hlmAvatar>
      <img hlmAvatarImage src="https://github.com/goetzrobin.png" alt="User" />
      <span hlmAvatarFallback>CN</span>
    </span>
  `,
})
```

### Icon
```typescript
import { HlmIconImports } from '@spartan-ng/helm/icon';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideX } from '@ng-icons/lucide';

@Component({
  imports: [HlmIconImports],
  providers: [provideIcons({ lucideCheck, lucideX })],
  template: `
    <ng-icon hlm name="lucideCheck" />
    <ng-icon hlm name="lucideX" size="lg" />
  `,
})
```
