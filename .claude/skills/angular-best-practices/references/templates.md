# Template Best Practices Reference

Comprehensive guide to Angular 20+ template syntax and patterns.

## Native Control Flow

Angular 20 uses built-in control flow syntax instead of structural directives.

### @if - Conditional Rendering

**Basic @if:**
```html
@if (user()) {
  <div class="user-profile">
    <h2>{{ user().name }}</h2>
  </div>
}
```

**@if with @else:**
```html
@if (isLoggedIn()) {
  <app-dashboard />
} @else {
  <app-login />
}
```

**@if with @else if:**
```html
@if (status() === 'loading') {
  <app-spinner />
} @else if (status() === 'error') {
  <app-error [message]="errorMessage()" />
} @else if (status() === 'empty') {
  <app-empty-state />
} @else {
  <app-content [data]="data()" />
}
```

**@if with as (variable binding):**
```html
@if (user$ | async; as user) {
  <div>
    <h2>{{ user.name }}</h2>
    <p>{{ user.email }}</p>
  </div>
}
```

**DO NOT use old syntax:**
```html
<!-- ❌ WRONG - don't use *ngIf -->
<div *ngIf="user()">{{ user().name }}</div>
<div *ngIf="isLoggedIn(); else loginTemplate">Dashboard</div>
<ng-template #loginTemplate>Login</ng-template>
```

### @for - Looping

**Basic @for with track:**
```html
@for (item of items(); track item.id) {
  <div class="item">{{ item.name }}</div>
}
```

**@for with @empty:**
```html
@for (item of items(); track item.id) {
  <app-item [item]="item" />
} @empty {
  <p>No items found</p>
}
```

**@for with context variables:**
```html
@for (item of items(); track item.id) {
  <div>
    <span>Index: {{ $index }}</span>
    <span>Count: {{ $count }}</span>
    <span>First: {{ $first }}</span>
    <span>Last: {{ $last }}</span>
    <span>Even: {{ $even }}</span>
    <span>Odd: {{ $odd }}</span>
  </div>
}
```

**Available context variables:**
- `$index` - Current index (0-based)
- `$count` - Total number of items
- `$first` - Boolean, true if first item
- `$last` - Boolean, true if last item
- `$even` - Boolean, true if even index
- `$odd` - Boolean, true if odd index

**Track expressions:**
```html
<!-- Track by ID (preferred for objects) -->
@for (user of users(); track user.id) {
  <div>{{ user.name }}</div>
}

<!-- Track by index (for primitives or when no unique ID) -->
@for (name of names(); track $index) {
  <div>{{ name }}</div>
}

<!-- Track by property -->
@for (item of items(); track item.sku) {
  <div>{{ item.name }}</div>
}
```

**DO NOT use old syntax:**
```html
<!-- ❌ WRONG - don't use *ngFor -->
<div *ngFor="let item of items(); let i = index">
  {{ i }}: {{ item.name }}
</div>
```

### @switch - Multiple Conditions

**Basic @switch:**
```html
@switch (status()) {
  @case ('loading') {
    <app-spinner />
  }
  @case ('error') {
    <app-error />
  }
  @case ('success') {
    <app-content />
  }
  @default {
    <app-unknown />
  }
}
```

**@switch with complex values:**
```html
@switch (userRole()) {
  @case ('admin') {
    <app-admin-dashboard />
  }
  @case ('moderator') {
    <app-moderator-panel />
  }
  @case ('user') {
    <app-user-dashboard />
  }
  @default {
    <app-guest-view />
  }
}
```

**DO NOT use old syntax:**
```html
<!-- ❌ WRONG - don't use [ngSwitch] -->
<div [ngSwitch]="status()">
  <p *ngSwitchCase="'loading'">Loading...</p>
  <p *ngSwitchCase="'error'">Error</p>
  <p *ngSwitchDefault>Done</p>
</div>
```

## Class Bindings

### Single Class Binding

```html
<!-- Conditional class -->
<div [class.active]="isActive()">Content</div>
<div [class.disabled]="isDisabled()">Content</div>
<div [class.highlighted]="isSelected()">Content</div>

<!-- Multiple conditional classes -->
<div 
  [class.primary]="variant() === 'primary'"
  [class.secondary]="variant() === 'secondary'"
  [class.large]="size() === 'large'">
  Button
</div>
```

### Multiple Classes Object

```html
<!-- Object syntax -->
<div [class]="{
  'active': isActive(),
  'disabled': isDisabled(),
  'loading': isLoading()
}">
  Content
</div>

<!-- Signal with object -->
<div [class]="classes()">Content</div>
```

```typescript
// Component
classes = computed(() => ({
  'active': this.isActive(),
  'disabled': this.isDisabled(),
  'large': this.size() === 'large'
}));
```

### String Classes

```html
<!-- Static classes -->
<div class="card shadow-lg rounded">Content</div>

<!-- Dynamic string -->
<div [class]="'card ' + variant()">Content</div>

<!-- Signal with string -->
<div [class]="classString()">Content</div>
```

```typescript
// Component
classString = computed(() => 
  `card ${this.variant()} ${this.size()}`
);
```

### DO NOT Use ngClass

```html
<!-- ❌ WRONG - don't use ngClass -->
<div [ngClass]="{'active': isActive(), 'disabled': isDisabled()}">
  Content
</div>
<div [ngClass]="classes()">Content</div>

<!-- ✅ CORRECT - use class bindings -->
<div [class]="{'active': isActive(), 'disabled': isDisabled()}">
  Content
</div>
<div [class]="classes()">Content</div>
```

## Style Bindings

### Single Style Property

```html
<!-- Pixel values -->
<div [style.width.px]="width()">Content</div>
<div [style.height.px]="height()">Content</div>
<div [style.margin-top.px]="margin()">Content</div>

<!-- Percentage values -->
<div [style.width.%]="percentage()">Content</div>

<!-- Other units -->
<div [style.padding.rem]="padding()">Content</div>
<div [style.font-size.em]="fontSize()">Content</div>

<!-- String values -->
<div [style.color]="textColor()">Content</div>
<div [style.background-color]="bgColor()">Content</div>
<div [style.display]="isVisible() ? 'block' : 'none'">Content</div>
```

### Multiple Styles Object

```html
<!-- Object syntax -->
<div [style]="{
  'color': textColor(),
  'background-color': bgColor(),
  'font-size.px': fontSize()
}">
  Content
</div>

<!-- Signal with object -->
<div [style]="styles()">Content</div>
```

```typescript
// Component
styles = computed(() => ({
  'color': this.textColor(),
  'background-color': this.bgColor(),
  'font-size.px': this.fontSize()
}));
```

### DO NOT Use ngStyle

```html
<!-- ❌ WRONG - don't use ngStyle -->
<div [ngStyle]="{'color': textColor(), 'font-size.px': fontSize()}">
  Content
</div>

<!-- ✅ CORRECT - use style bindings -->
<div [style]="{'color': textColor(), 'font-size.px': fontSize()}">
  Content
</div>
```

## Property Bindings

### Element Properties

```html
<!-- Boolean properties -->
<button [disabled]="isDisabled()">Click</button>
<input [readonly]="isReadonly()" />
<input [checked]="isChecked()" />

<!-- String properties -->
<img [src]="imageUrl()" [alt]="altText()" />
<a [href]="link()">Link</a>
<input [value]="inputValue()" />

<!-- Number properties -->
<input [tabindex]="tabIndex()" />
<progress [value]="progress()" [max]="100"></progress>
```

### Attribute Bindings

```html
<!-- ARIA attributes -->
<button 
  [attr.aria-label]="ariaLabel()"
  [attr.aria-disabled]="isDisabled()"
  [attr.aria-expanded]="isExpanded()">
  Button
</button>

<!-- Data attributes -->
<div 
  [attr.data-id]="itemId()"
  [attr.data-type]="itemType()">
  Content
</div>

<!-- Other attributes -->
<div [attr.role]="role()">Content</div>
<svg [attr.viewBox]="viewBox()">...</svg>
```

## Event Bindings

### Basic Events

```html
<!-- Click events -->
<button (click)="handleClick()">Click</button>
<div (click)="onDivClick($event)">Click div</div>

<!-- Input events -->
<input (input)="onInput($event)" />
<input (change)="onChange($event)" />
<input (blur)="onBlur()" />
<input (focus)="onFocus()" />

<!-- Form events -->
<form (submit)="onSubmit($event)">
  <button type="submit">Submit</button>
</form>

<!-- Mouse events -->
<div 
  (mouseenter)="onMouseEnter()"
  (mouseleave)="onMouseLeave()"
  (mouseover)="onMouseOver()"
  (mouseout)="onMouseOut()">
  Hover me
</div>

<!-- Keyboard events -->
<input 
  (keydown)="onKeyDown($event)"
  (keyup)="onKeyUp($event)"
  (keypress)="onKeyPress($event)" />
```

### Event Object

```typescript
// Component
handleClick(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  console.log('Clicked at:', event.clientX, event.clientY);
}

onInput(event: Event) {
  const target = event.target as HTMLInputElement;
  console.log('Input value:', target.value);
}

onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    console.log('Enter pressed');
  }
}
```

### Template Reference Variables

```html
<!-- Get element reference -->
<input #searchInput (input)="search(searchInput.value)" />

<!-- Use in expressions -->
<input #email type="email" />
<button (click)="validateEmail(email.value)">Validate</button>

<!-- Use with @if -->
<input #username />
@if (username.value.length > 0) {
  <p>Username: {{ username.value }}</p>
}
```

## Two-Way Binding

```html
<!-- Forms -->
<input [(ngModel)]="name" />
<textarea [(ngModel)]="description"></textarea>
<select [(ngModel)]="selectedOption">
  <option value="1">Option 1</option>
  <option value="2">Option 2</option>
</select>

<!-- Custom components -->
<app-custom [(value)]="myValue" />

<!-- Expanded form (useful for debugging) -->
<input 
  [ngModel]="name" 
  (ngModelChange)="name = $event" />
```

## Pipes

### Built-in Pipes

```html
<!-- Async pipe -->
<div>{{ user$ | async }}</div>
@if (users$ | async; as users) {
  @for (user of users; track user.id) {
    <div>{{ user.name }}</div>
  }
}

<!-- Date pipe -->
<p>{{ today | date }}</p>
<p>{{ today | date:'short' }}</p>
<p>{{ today | date:'yyyy-MM-dd' }}</p>

<!-- Currency pipe -->
<p>{{ price | currency }}</p>
<p>{{ price | currency:'EUR' }}</p>
<p>{{ price | currency:'USD':'symbol':'1.2-2' }}</p>

<!-- Number pipes -->
<p>{{ value | number }}</p>
<p>{{ value | number:'1.2-3' }}</p>
<p>{{ percentage | percent }}</p>

<!-- String pipes -->
<p>{{ text | uppercase }}</p>
<p>{{ text | lowercase }}</p>
<p>{{ text | titlecase }}</p>

<!-- JSON pipe (debugging) -->
<pre>{{ user | json }}</pre>

<!-- Slice pipe -->
<p>{{ text | slice:0:10 }}</p>
@for (item of items() | slice:0:5; track item.id) {
  <div>{{ item.name }}</div>
}
```

### Chaining Pipes

```html
<p>{{ today | date:'short' | uppercase }}</p>
<p>{{ price | currency:'USD' | lowercase }}</p>
```

### Custom Pipes

```typescript
// Component using custom pipe
@Component({
  selector: 'app-example',
  imports: [CustomPipe],
  template: `
    <p>{{ value | custom }}</p>
  `
})
```

## Template Interpolation

```html
<!-- Simple values -->
<p>{{ name() }}</p>
<p>{{ age() }}</p>
<p>{{ isActive() }}</p>

<!-- Expressions -->
<p>{{ firstName() + ' ' + lastName() }}</p>
<p>{{ count() * 2 }}</p>
<p>{{ items().length }}</p>

<!-- Method calls -->
<p>{{ getFullName() }}</p>
<p>{{ calculate(a(), b()) }}</p>

<!-- Ternary operators -->
<p>{{ isActive() ? 'Active' : 'Inactive' }}</p>
<p>{{ count() > 0 ? count() + ' items' : 'No items' }}</p>

<!-- Null coalescing -->
<p>{{ user()?.name ?? 'Guest' }}</p>
<p>{{ settings()?.theme ?? 'default' }}</p>
```

## Content Projection

### Single Slot

```typescript
// Child component
@Component({
  selector: 'app-card',
  template: `
    <div class="card">
      <ng-content />
    </div>
  `
})
export class CardComponent {}
```

```html
<!-- Usage -->
<app-card>
  <h2>Title</h2>
  <p>Content goes here</p>
</app-card>
```

### Multiple Slots

```typescript
// Child component
@Component({
  selector: 'app-panel',
  template: `
    <div class="panel">
      <div class="panel-header">
        <ng-content select="[header]" />
      </div>
      <div class="panel-body">
        <ng-content />
      </div>
      <div class="panel-footer">
        <ng-content select="[footer]" />
      </div>
    </div>
  `
})
export class PanelComponent {}
```

```html
<!-- Usage -->
<app-panel>
  <h2 header>Panel Title</h2>
  <p>Main content</p>
  <button footer>Action</button>
</app-panel>
```

### Select by Element

```typescript
@Component({
  selector: 'app-layout',
  template: `
    <header>
      <ng-content select="header" />
    </header>
    <main>
      <ng-content select="main" />
    </main>
    <footer>
      <ng-content select="footer" />
    </footer>
  `
})
```

```html
<app-layout>
  <header>Header content</header>
  <main>Main content</main>
  <footer>Footer content</footer>
</app-layout>
```

## NgTemplateOutlet

```html
<!-- Define template -->
<ng-template #templateRef let-name="name" let-age="age">
  <div>
    <p>Name: {{ name }}</p>
    <p>Age: {{ age }}</p>
  </div>
</ng-template>

<!-- Use template -->
<ng-container 
  *ngTemplateOutlet="templateRef; context: {name: 'John', age: 30}">
</ng-container>
```

### Dynamic Templates

```typescript
@Component({
  template: `
    <ng-template #template1>Template 1</ng-template>
    <ng-template #template2>Template 2</ng-template>
    
    <ng-container *ngTemplateOutlet="currentTemplate()" />
  `
})
export class DynamicComponent {
  @ViewChild('template1') template1!: TemplateRef<any>;
  @ViewChild('template2') template2!: TemplateRef<any>;
  
  currentTemplate = signal<TemplateRef<any> | null>(null);
  
  ngAfterViewInit() {
    this.currentTemplate.set(this.template1);
  }
}
```

## Best Practices

### Keep Templates Simple

```html
<!-- ❌ BAD - complex logic in template -->
<div>
  {{ items().filter(i => i.active).map(i => i.name).join(', ') }}
</div>

<!-- ✅ GOOD - move logic to component -->
<div>{{ activeItemNames() }}</div>
```

```typescript
// Component
activeItemNames = computed(() => 
  this.items()
    .filter(i => i.active)
    .map(i => i.name)
    .join(', ')
);
```

### Use Semantic HTML

```html
<!-- ✅ GOOD - semantic elements -->
<header>
  <nav>
    <ul>
      <li><a href="/">Home</a></li>
    </ul>
  </nav>
</header>

<main>
  <article>
    <h1>Title</h1>
    <section>Content</section>
  </article>
</main>

<footer>
  <p>Copyright 2024</p>
</footer>
```

### Accessibility

```html
<!-- ARIA labels -->
<button 
  [attr.aria-label]="closeLabel()"
  [attr.aria-pressed]="isPressed()">
  <span aria-hidden="true">×</span>
</button>

<!-- Alt text for images -->
<img [src]="imageUrl()" [alt]="imageDescription()" />

<!-- Form labels -->
<label for="email">Email</label>
<input id="email" type="email" />

<!-- Roles -->
<div role="navigation">
  <ul role="menu">
    <li role="menuitem">Item</li>
  </ul>
</div>
```

### Track Performance

```html
<!-- Always use track in @for -->
@for (item of largeList(); track item.id) {
  <app-expensive-component [data]="item" />
}

<!-- Use OnPush change detection -->
<!-- Avoid unnecessary re-renders -->
```

### Avoid Template Expressions with Side Effects

```html
<!-- ❌ BAD - method with side effects -->
<div>{{ logAndReturn(value()) }}</div>

<!-- ✅ GOOD - pure expression -->
<div>{{ value() }}</div>
```
