---
name: angular-spartan-styling
description: Create beautiful, accessible user interfaces with Spartan UI components (Angular adaptation of shadcn/ui, built on Radix UI patterns + Tailwind), Tailwind CSS 4 utility-first styling, and canvas-based visual designs. Use when building Angular UIs, implementing design systems, creating responsive layouts, adding accessible components (dialogs, dropdowns, forms, tables), customizing themes and colors, implementing dark mode, or establishing consistent styling patterns across Angular applications.
---

# Angular Spartan UI Styling Skill

Comprehensive skill for creating beautiful, accessible user interfaces in Angular combining Spartan UI components (Angular adaptation of shadcn/ui), Tailwind CSS 4 utility styling, and canvas-based visual design systems.

## Reference

- Spartan UI: https://spartan.ng/documentation
- Tailwind CSS 4: https://tailwindcss.com/docs
- Original shadcn/ui: https://ui.shadcn.com

## When to Use This Skill

Use when:
- Building UI in Angular applications (Angular 20+)
- Implementing accessible components (dialogs, forms, tables, navigation)
- Styling with utility-first CSS approach (Tailwind CSS 4)
- Creating responsive, mobile-first layouts
- Implementing dark mode and theme customization
- Building design systems with consistent tokens
- Generating visual designs, posters, or brand materials
- Rapid prototyping with immediate visual feedback
- Adding complex UI patterns (data tables, charts, command palettes)
- Working on Rabbithole project or similar Angular + ICP applications

## Core Stack

### Component Layer: Spartan UI (hlm)
- Angular adaptation of shadcn/ui patterns
- Built on accessible primitives (inspired by Radix UI)
- Two-layer architecture: Brain (brn) + Helm (hlm)
- Copy-paste distribution model (components live in your codebase)
- TypeScript-first with full type safety
- Signal-based reactivity
- Standalone components

### Styling Layer: Tailwind CSS 4
- Utility-first CSS framework
- Modern @theme directive for customization
- Build-time processing with zero runtime overhead
- Mobile-first responsive design
- Consistent design tokens (colors, spacing, typography)
- Automatic dead code elimination
- oklch color space support

### Visual Design Layer: Canvas
- Museum-quality visual compositions
- Philosophy-driven design approach
- Sophisticated visual communication
- Minimal text, maximum visual impact
- Systematic patterns and refined aesthetics

## Quick Start

### Spartan UI + Tailwind Setup

**Prerequisites:**
```bash
# Angular 20+ project with standalone components
# Nx monorepo (Rabbithole project structure)
```

**Add Spartan components via CLI:**
```bash
npx @spartan-ng/cli@latest add button
npx @spartan-ng/cli@latest add card dialog form
```

**Use components with utility styling:**
```typescript
import { Component } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';

@Component({
  selector: 'app-dashboard',
  imports: [HlmButtonImports, HlmCardImports],
  template: `
    <div class="container mx-auto p-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <div hlmCard class="hover:shadow-lg transition-shadow">
        <div hlmCardHeader>
          <h3 hlmCardTitle class="text-2xl font-bold">Analytics</h3>
        </div>
        <div hlmCardContent class="space-y-4">
          <p class="text-muted-foreground">View your metrics</p>
          <button hlmBtn variant="default" class="w-full">
            View Details
          </button>
        </div>
      </div>
    </div>
  `,
})
export class DashboardComponent {}
```

### Key Differences from React/shadcn

**Component Usage:**
```typescript
// React/shadcn
<Button variant="default">Click</Button>

// Angular/Spartan
<button hlmBtn variant="default">Click</button>
```

**Class Merging:**
```typescript
// React/shadcn - cn utility
import { cn } from '@/lib/utils';
cn('px-4', 'bg-primary')

// Angular/Spartan - hlm utility
import { hlm } from '@spartan-ng/helm/utils';
hlm('px-4', 'bg-primary')
```

**State Management:**
```typescript
// React - useState
const [isOpen, setIsOpen] = useState(false);

// Angular - signals
readonly isOpen = signal(false);
```

## Component Library Guide

**Comprehensive component catalog with Angular usage patterns, installation, and composition examples.**

See: `references/spartan-components.md`

Covers:
- Form & input components (Button, Input, Select, Checkbox, Date Picker, Form Field)
- Layout & navigation (Card, Tabs, Accordion, Sidebar)
- Overlays & dialogs (Dialog, Sheet, Popover, Toast/Sonner, Command)
- Feedback & status (Alert, Badge, Progress, Spinner, Skeleton)
- Display components (Table, Avatar, Icon, Typography)

## Theme & Customization

**Theme configuration, CSS variables, dark mode implementation, and component customization for Angular.**

See: `references/spartan-theming.md`

Covers:
- Dark mode setup in Angular
- CSS variable system (same as shadcn/ui)
- Color customization with oklch
- Component variant customization with CVA
- Theme service implementation
- Spartan-specific patterns

## Accessibility Patterns

**ARIA patterns, keyboard navigation, screen reader support, and accessible component usage in Angular.**

See: `references/spartan-accessibility.md`

Covers:
- Spartan UI accessibility features (based on Radix UI patterns)
- Keyboard navigation in Angular components
- Focus management with Angular CDK
- Screen reader announcements
- Form validation accessibility with Reactive Forms
- Angular-specific accessibility patterns

## Tailwind Utilities

**Core utility classes for layout, spacing, typography, colors, borders, and shadows (Tailwind CSS 4).**

See: `references/tailwind-utilities.md`

Covers:
- Layout utilities (Flexbox, Grid, positioning)
- Spacing system (padding, margin, gap)
- Typography (font sizes, weights, alignment, line height)
- Colors and backgrounds (oklch support)
- Borders and shadows
- Arbitrary values for custom styling

## Responsive Design

**Mobile-first breakpoints, responsive utilities, and adaptive layouts with Tailwind CSS 4.**

See: `references/tailwind-responsive.md`

Covers:
- Mobile-first approach
- Breakpoint system (sm, md, lg, xl, 2xl)
- Responsive utility patterns
- Container queries
- Max-width queries
- Custom breakpoints with @theme

## Tailwind Customization

**@theme directive, custom utilities, and theme extensions in Tailwind CSS 4.**

See: `references/tailwind-customization.md`

Covers:
- @theme directive for custom tokens
- Custom colors with oklch
- Custom fonts and spacing
- Custom utility creation
- Custom variants
- Layer organization (@layer base, components, utilities)
- Spartan UI integration patterns

## Visual Design System

**Canvas-based design philosophy, visual communication principles, and sophisticated compositions.**

See: `references/canvas-design-system.md`

Covers:
- Design philosophy approach
- Visual communication over text
- Systematic patterns and composition
- Color, form, and spatial design
- Minimal text integration
- Museum-quality execution
- Multi-page design systems

## Best Practices

1. **Signal-Based Reactivity**: Use signals and computed for reactive state
2. **Directive Composition**: Build complex UIs from directive-based primitives
3. **Utility-First Styling**: Use Tailwind classes; extract only for repetition
4. **Mobile-First Responsive**: Start mobile, layer responsive variants
5. **Accessibility-First**: Leverage Spartan primitives, add focus states, semantic HTML
6. **Design Tokens**: Use consistent spacing, colors, typography via @theme
7. **Dark Mode Consistency**: Apply dark variants to all themed elements
8. **hlm Utility**: Always use hlm() for class merging, not string concatenation
9. **TypeScript**: Full type safety with Angular and Spartan
10. **Expert Craftsmanship**: Every detail matters - treat UI as a craft

## Reference Navigation

**Component Library**
- `references/spartan-components.md` - Complete component catalog (Angular)

**Styling System**
- `references/tailwind-utilities.md` - Core utility classes (Tailwind CSS 4)
- `references/tailwind-responsive.md` - Responsive design
- `references/tailwind-customization.md` - @theme and customization (Tailwind CSS 4)

**Visual Design**
- `references/canvas-design-system.md` - Design philosophy and canvas workflows

## Common Patterns

**Form with Reactive Forms validation:**
```typescript
import { Component, inject } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmFormFieldImports } from '@spartan-ng/helm/form-field';

@Component({
  selector: 'app-login-form',
  imports: [
    ReactiveFormsModule,
    HlmInputImports,
    HlmLabelImports,
    HlmButtonImports,
    HlmFormFieldImports,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-6">
      <brn-form-field>
        <label hlmLabel for="email">Email</label>
        <input hlmInput id="email" type="email" formControlName="email" />
        @if (form.controls.email.hasError('email') && form.controls.email.touched) {
          <p class="text-sm text-destructive mt-1">Invalid email</p>
        }
      </brn-form-field>

      <brn-form-field>
        <label hlmLabel for="password">Password</label>
        <input hlmInput id="password" type="password" formControlName="password" />
        @if (form.controls.password.hasError('minlength') && form.controls.password.touched) {
          <p class="text-sm text-destructive mt-1">Min 8 characters</p>
        }
      </brn-form-field>

      <button hlmBtn type="submit" class="w-full" [disabled]="form.invalid">
        Sign In
      </button>
    </form>
  `,
})
export class LoginFormComponent {
  private fb = inject(FormBuilder);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  onSubmit() {
    console.log(this.form.value);
  }
}
```

**Responsive layout with dark mode:**
```typescript
@Component({
  template: `
    <div class="min-h-screen bg-white dark:bg-gray-900">
      <div class="container mx-auto px-4 py-8">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div hlmCard class="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <div hlmCardContent class="p-6">
              <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
                Content
              </h3>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
```

**Dynamic classes with signals and CVA:**
```typescript
import { Component, signal, computed } from '@angular/core';
import { hlm } from '@spartan-ng/helm/utils';
import { cva } from 'class-variance-authority';

const buttonVariants = cva(
  'px-4 py-2 rounded-md font-medium transition-colors',
  {
    variants: {
      active: {
        true: 'bg-primary text-primary-foreground',
        false: 'bg-secondary text-secondary-foreground',
      },
    },
    defaultVariants: {
      active: false,
    },
  }
);

@Component({
  template: `
    <button [class]="buttonClasses()" (click)="toggle()">
      {{ isActive() ? 'Active' : 'Inactive' }}
    </button>
  `,
})
export class DynamicButtonComponent {
  readonly isActive = signal(false);

  readonly buttonClasses = computed(() => 
    hlm(buttonVariants({ active: this.isActive() }))
  );

  toggle() {
    this.isActive.update(v => !v);
  }
}
```

## Project Integration (Rabbithole)

**Import pattern:**
```typescript
// Standard Spartan imports
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { hlm } from '@spartan-ng/helm/utils';
```

**TypeScript path configuration:**
```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@spartan-ng/helm/button": ["libs/ui/button/src/index.ts"],
      "@spartan-ng/helm/card": ["libs/ui/card/src/index.ts"],
      "@spartan-ng/helm/utils": ["libs/ui/utils/src/index.ts"]
    }
  }
}
```

## Resources

- Spartan UI Docs: https://spartan.ng/documentation
- Tailwind CSS 4: https://tailwindcss.com
- Angular Docs: https://angular.dev
- Radix UI (inspiration): https://radix-ui.com
- shadcn/ui (original): https://ui.shadcn.com
- v0 (AI UI Generator - React, adapt to Angular): https://v0.dev