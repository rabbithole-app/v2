# Component Patterns Reference

Detailed guidance for Angular 20+ component architecture and patterns.

## Component Architecture

### Single Responsibility Principle

Each component should have one clear purpose. If a component does too much, split it into smaller components.

**Bad - Component doing too much:**
```typescript
@Component({
  selector: 'app-user-dashboard'
})
export class UserDashboardComponent {
  // User management
  users = signal<User[]>([]);
  selectedUser = signal<User | null>(null);
  
  // Analytics
  analyticsData = signal<Analytics>({});
  
  // Settings
  userSettings = signal<Settings>({});
  
  // Notifications
  notifications = signal<Notification[]>([]);
  
  // Too many responsibilities!
}
```

**Good - Focused components:**
```typescript
@Component({
  selector: 'app-user-dashboard',
  template: `
    <app-user-list (userSelected)="onUserSelected($event)" />
    <app-analytics [userId]="selectedUserId()" />
    <app-user-settings [userId]="selectedUserId()" />
    <app-notifications />
  `
})
export class UserDashboardComponent {
  selectedUserId = signal<string | null>(null);
  
  onUserSelected(userId: string) {
    this.selectedUserId.set(userId);
  }
}
```

## Input and Output Patterns

### Required vs Optional Inputs

```typescript
export class ProductCardComponent {
  // Required input - must be provided
  product = input.required<Product>();
  
  // Optional with default value
  showPrice = input<boolean>(true);
  
  // Optional without default (undefined initially)
  discount = input<number>();
  
  // Transform input value
  quantity = input(1, {
    transform: (value: string | number) => {
      return typeof value === 'string' ? parseInt(value, 10) : value;
    }
  });
}
```

### Type-Safe Outputs

```typescript
export class SearchComponent {
  // Simple event
  searchClicked = output<void>();
  
  // Event with data
  searchQuery = output<string>();
  
  // Complex event payload
  searchCompleted = output<{
    query: string;
    results: SearchResult[];
    timestamp: Date;
  }>();
  
  performSearch(query: string) {
    // Emit events
    this.searchQuery.emit(query);
    
    // After search completes
    this.searchCompleted.emit({
      query,
      results: this.results(),
      timestamp: new Date()
    });
  }
}
```

## Host Bindings and Listeners

### Modern Host Configuration

```typescript
@Component({
  selector: 'app-button',
  host: {
    // Class bindings
    '[class.primary]': 'variant() === "primary"',
    '[class.disabled]': 'disabled()',
    '[class.loading]': 'loading()',
    
    // Attribute bindings
    '[attr.aria-disabled]': 'disabled()',
    '[attr.aria-label]': 'ariaLabel()',
    
    // Style bindings
    '[style.width.px]': 'width()',
    '[style.height.px]': 'height()',
    
    // Event listeners
    '(click)': 'onClick($event)',
    '(mouseenter)': 'onMouseEnter()',
    '(mouseleave)': 'onMouseLeave()',
    
    // Static values
    'role': 'button',
    'tabindex': '0'
  }
})
export class ButtonComponent {
  variant = input<'primary' | 'secondary'>('primary');
  disabled = input<boolean>(false);
  loading = input<boolean>(false);
  ariaLabel = input<string>('');
  width = input<number>();
  height = input<number>();
  
  clicked = output<MouseEvent>();
  
  onClick(event: MouseEvent) {
    if (!this.disabled() && !this.loading()) {
      this.clicked.emit(event);
    }
  }
  
  onMouseEnter() {
    // Handle hover
  }
  
  onMouseLeave() {
    // Handle hover end
  }
}
```

## Component Communication

### Parent to Child (via Inputs)

```typescript
// Parent
@Component({
  selector: 'app-parent',
  template: `
    <app-child 
      [data]="parentData()" 
      [config]="config()" />
  `
})
export class ParentComponent {
  parentData = signal({ name: 'Test' });
  config = signal({ theme: 'dark' });
}

// Child
@Component({
  selector: 'app-child'
})
export class ChildComponent {
  data = input.required<{ name: string }>();
  config = input<{ theme: string }>();
  
  // React to input changes
  displayName = computed(() => this.data().name.toUpperCase());
}
```

### Child to Parent (via Outputs)

```typescript
// Child
@Component({
  selector: 'app-child'
})
export class ChildComponent {
  dataChanged = output<string>();
  
  updateData(newValue: string) {
    this.dataChanged.emit(newValue);
  }
}

// Parent
@Component({
  selector: 'app-parent',
  template: `
    <app-child (dataChanged)="onDataChanged($event)" />
  `
})
export class ParentComponent {
  onDataChanged(value: string) {
    console.log('Data changed:', value);
  }
}
```

### Sibling Communication (via Service)

```typescript
// Shared service
@Injectable({ providedIn: 'root' })
export class SharedDataService {
  private dataSubject = new BehaviorSubject<string>('');
  data$ = this.dataSubject.asObservable();
  
  updateData(value: string) {
    this.dataSubject.next(value);
  }
}

// Sibling 1 - Producer
@Component({
  selector: 'app-producer'
})
export class ProducerComponent {
  private sharedData = inject(SharedDataService);
  
  sendData(value: string) {
    this.sharedData.updateData(value);
  }
}

// Sibling 2 - Consumer
@Component({
  selector: 'app-consumer'
})
export class ConsumerComponent {
  private sharedData = inject(SharedDataService);
  data$ = this.sharedData.data$;
}
```

## Template Strategies

### When to Use Inline Templates

Use inline templates for:
- Simple components (< 10 lines)
- Components that are highly reusable
- When template and logic are tightly coupled

```typescript
@Component({
  selector: 'app-badge',
  template: `
    <span class="badge" [class.active]="active()">
      {{ text() }}
    </span>
  `
})
export class BadgeComponent {
  text = input.required<string>();
  active = input<boolean>(false);
}
```

### When to Use External Templates

Use external templates for:
- Complex layouts (> 10 lines)
- Components with extensive markup
- When you need syntax highlighting and better editing

```typescript
@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  styleUrl: './user-profile.component.scss'
})
export class UserProfileComponent {
  // Complex component logic
}
```

## Change Detection Optimization

### Always Use OnPush

```typescript
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-optimized',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `...`
})
export class OptimizedComponent {
  // With OnPush and signals, change detection only runs when:
  // 1. An input signal changes
  // 2. An event occurs in the template
  // 3. An async pipe receives a new value
}
```

### OnPush with Signals

Signals work perfectly with OnPush because they notify Angular when values change:

```typescript
@Component({
  selector: 'app-counter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p>Count: {{ count() }}</p>
    <button (click)="increment()">Increment</button>
  `
})
export class CounterComponent {
  count = signal(0);
  
  increment() {
    // Signal update automatically triggers change detection
    this.count.update(n => n + 1);
  }
}
```

## Component Lifecycle

### Effect for Side Effects

Use `effect()` for side effects that should run when signals change:

```typescript
import { Component, effect } from '@angular/core';

@Component({
  selector: 'app-tracker'
})
export class TrackerComponent {
  userId = input.required<string>();
  
  private analytics = inject(AnalyticsService);
  
  constructor() {
    // Effect runs when userId changes
    effect(() => {
      const id = this.userId();
      this.analytics.trackUser(id);
    });
  }
}
```

### Cleanup with DestroyRef

```typescript
import { Component, DestroyRef, inject } from '@angular/core';

@Component({
  selector: 'app-subscription'
})
export class SubscriptionComponent {
  private destroyRef = inject(DestroyRef);
  private dataService = inject(DataService);
  
  data$ = this.dataService.getData();
  
  constructor() {
    // Register cleanup
    this.destroyRef.onDestroy(() => {
      console.log('Component destroyed');
      // Cleanup logic here
    });
  }
}
```

## Content Projection

### Basic Content Projection

```typescript
@Component({
  selector: 'app-card',
  template: `
    <div class="card">
      <div class="card-header">
        <ng-content select="[header]" />
      </div>
      <div class="card-body">
        <ng-content />
      </div>
      <div class="card-footer">
        <ng-content select="[footer]" />
      </div>
    </div>
  `
})
export class CardComponent {}

// Usage:
// <app-card>
//   <h2 header>Title</h2>
//   <p>Main content</p>
//   <button footer>Action</button>
// </app-card>
```

## Dynamic Components

### Using NgComponentOutlet

```typescript
@Component({
  selector: 'app-dynamic',
  template: `
    <ng-container *ngComponentOutlet="componentType()" />
  `
})
export class DynamicComponent {
  componentType = signal<Type<any>>(DefaultComponent);
  
  switchComponent(newType: Type<any>) {
    this.componentType.set(newType);
  }
}
```

## Component Testing Best Practices

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

describe('UserCardComponent', () => {
  let component: UserCardComponent;
  let fixture: ComponentFixture<UserCardComponent>;
  
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserCardComponent]
    }).compileComponents();
    
    fixture = TestBed.createComponent(UserCardComponent);
    component = fixture.componentInstance;
  });
  
  it('should display user name', () => {
    // Set required inputs
    fixture.componentRef.setInput('user', {
      id: '1',
      name: 'John Doe'
    });
    
    fixture.detectChanges();
    
    const element = fixture.nativeElement;
    expect(element.textContent).toContain('John Doe');
  });
  
  it('should emit event when clicked', () => {
    const user = { id: '1', name: 'John' };
    fixture.componentRef.setInput('user', user);
    
    let emittedValue: string | undefined;
    component.userSelected.subscribe(value => {
      emittedValue = value;
    });
    
    component.handleClick();
    
    expect(emittedValue).toBe('1');
  });
});
```
