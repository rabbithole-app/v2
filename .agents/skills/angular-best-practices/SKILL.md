---
name: angular-best-practices
description: Modern Angular development standards with standalone components, signals, input/output functions, native control flow (@if, @for, @switch), ChangeDetectionStrategy.OnPush, inject() function, reactive state management, and forms (Reactive Forms and Signal Forms). Use when writing or reviewing Angular code, creating components, managing state with signals, working with templates, forms, schema validation, or when user asks about Angular best practices.
allowed-tools: Read, Edit, Grep, Glob
---

# Angular Best Practices

Apply modern Angular development standards focusing on standalone components, signals, and performance.

## Core Principles

1. **Standalone components only** - No NgModules
2. **Signals for state** - Reactive and efficient
3. **OnPush change detection** - Always
4. **Native control flow** - `@if`, `@for`, `@switch`
5. **Type safety** - Strict TypeScript

## Component Checklist

When creating or reviewing Angular components:

- [ ] Do NOT set `standalone: true` (it's default in Angular 20+)
- [ ] Use `input()` and `output()` functions, not decorators
- [ ] Set `changeDetection: ChangeDetectionStrategy.OnPush`
- [ ] Use `inject()` function instead of constructor injection
- [ ] Use signals for local state
- [ ] Use `computed()` for derived state
- [ ] Put host bindings in `host` object, not decorators

## Quick Examples

### Component Structure

```typescript
import { Component, ChangeDetectionStrategy, input, output, signal, computed, inject } from '@angular/core';

@Component({
  selector: 'app-user-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.active]': 'isActive()',
    '(click)': 'handleClick()'
  },
  template: `
    @if (user()) {
      <div class="card">
        <h3>{{ user().name }}</h3>
        @if (showDetails()) {
          <p>{{ user().email }}</p>
        }
      </div>
    }
  `
})
export class UserCardComponent {
  // Inputs - use input() function
  user = input.required<User>();
  showDetails = input<boolean>(false);
  
  // Outputs - use output() function
  userSelected = output<string>();
  
  // Services - use inject() function
  private userService = inject(UserService);
  
  // State - use signals
  isActive = signal(false);
  
  // Derived state - use computed()
  displayName = computed(() => 
    this.user().firstName + ' ' + this.user().lastName
  );
  
  handleClick() {
    this.userSelected.emit(this.user().id);
  }
}
```

### Template Patterns

**Native Control Flow (CORRECT):**
```html
@if (isVisible) {
  <section>Content</section>
}

@for (item of items(); track item.id) {
  <div>{{ item.name }}</div>
}

@switch (status) {
  @case ('loading') { <p>Loading...</p> }
  @case ('error') { <p>Error</p> }
  @default { <p>Done</p> }
}
```

**DO NOT use old syntax:**
```html
<!-- WRONG - don't use *ngIf, *ngFor, *ngSwitch -->
<section *ngIf="isVisible">Content</section>
<div *ngFor="let item of items">{{ item.name }}</div>
```

### Class and Style Bindings

**DO NOT use ngClass or ngStyle:**
```html
<!-- WRONG -->
<div [ngClass]="{'active': isActive}"></div>
<div [ngStyle]="{'color': textColor}"></div>

<!-- CORRECT -->
<div [class.active]="isActive"></div>
<div [style.color]="textColor"></div>
```

### State Management

```typescript
// Local state with signals
count = signal(0);
items = signal<Item[]>([]);

// Derived state with computed()
total = computed(() => 
  this.items().reduce((sum, item) => sum + item.price, 0)
);

// Update signals - use set() or update()
increment() {
  this.count.update(n => n + 1);
}

addItem(item: Item) {
  this.items.update(items => [...items, item]);
}

// DO NOT use mutate()
// this.items.mutate(arr => arr.push(item)); // WRONG
```

### Service Injection

```typescript
// CORRECT - use inject() function
export class MyComponent {
  private userService = inject(UserService);
  private router = inject(Router);
  private fb = inject(FormBuilder);
}

// WRONG - old constructor injection
// constructor(
//   private userService: UserService,
//   private router: Router
// ) {}
```

### Services

```typescript
@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);
  
  // Single responsibility - user operations only
  getUsers() { }
  saveUser(user: User) { }
}
```

## TypeScript Rules

- Enable strict type checking
- Prefer type inference when obvious
- Never use `any` - use `unknown` for uncertain types
- Let TypeScript infer types from context

```typescript
// CORRECT - type inference
let name = 'Angular';
const count = 42;

// WRONG - unnecessary type annotations
let name: string = 'Angular';
const count: number = 42;
```

## Forms

### Reactive Forms (Angular 20+)

Prefer Reactive Forms for complex forms:

```typescript
export class UserFormComponent {
  private fb = inject(FormBuilder);
  
  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]]
  });
}
```

### Signal Forms (Angular 21+ - Experimental)

For new projects on Angular 21+, consider Signal Forms with schema validation:

```typescript
import { form, schema, Field, required, email } from '@angular/forms/signals';

interface User {
  name: string;
  email: string;
}

const userSchema = schema<User>((f) => {
  required(f.name, { message: 'Name is required' });
  email(f.email, { message: 'Invalid email' });
});

@Component({
  selector: 'app-user-form',
  imports: [Field],
  template: `
    <form (ngSubmit)="onSubmit()">
      <input [field]="userForm.name" placeholder="Name" />
      @if (userForm.name().touched()) {
        @for (error of userForm.name().errors(); track error.kind) {
          <span>{{ error.message }}</span>
        }
      }
      
      <input [field]="userForm.email" type="email" placeholder="Email" />
      @if (userForm.email().touched()) {
        @for (error of userForm.email().errors(); track error.kind) {
          <span>{{ error.message }}</span>
        }
      }
      
      <button type="submit" [disabled]="!userForm().valid()">Submit</button>
    </form>
  `
})
export class UserFormComponent {
  user = signal<User>({ name: '', email: '' });
  userForm = form(this.user, userSchema);
  
  onSubmit() {
    if (this.userForm().valid()) {
      console.log('Valid data:', this.user());
    }
  }
}
```

**Note:** Signal Forms are experimental. See [FORMS.md](FORMS.md) for complete guide including custom validators, nested objects, and arrays.

## Performance

- **NgOptimizedImage** for all static images
- **Lazy loading** for feature routes
- **Track functions** in `@for` loops (required)

```html
<!-- Always use track in @for -->
@for (item of items(); track item.id) {
  <div>{{ item.name }}</div>
}

<!-- For primitives, use $index -->
@for (name of names(); track $index) {
  <div>{{ name }}</div>
}
```

## Async Pipe

Always use `async` pipe for observables:

```typescript
// Component
user$ = inject(UserService).getUser();

// Template
@if (user$ | async; as user) {
  <div>{{ user.name }}</div>
}
```

## Common Mistakes to Avoid

1. ❌ Setting `standalone: true` explicitly
2. ❌ Using `@Input()` and `@Output()` decorators
3. ❌ Using `*ngIf`, `*ngFor`, `*ngSwitch`
4. ❌ Using `ngClass` or `ngStyle`
5. ❌ Using `@HostBinding` or `@HostListener`
6. ❌ Constructor injection instead of `inject()`
7. ❌ Using `mutate()` on signals
8. ❌ Forgetting `track` in `@for` loops
9. ❌ Not setting `ChangeDetectionStrategy.OnPush`
10. ❌ Complex logic in templates

## Additional Resources

For detailed guidance on specific topics, see:
- [references/components.md](references/components.md) - Component architecture and patterns
- [references/signals.md](references/signals.md) - State management with signals
- [references/templates.md](references/templates.md) - Template syntax and best practices
- [references/forms.md](references/forms.md) - Reactive forms and Signal Forms

## When to Apply This Skill

Use this Skill when:
- Creating new Angular components, services, or directives
- Reviewing Angular code for best practices
- Refactoring from older Angular versions
- Writing templates with control flow
- Managing component state
- Setting up forms
- Optimizing performance
- User asks about Angular best practices or modern patterns