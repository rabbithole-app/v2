# Signals State Management Reference

Comprehensive guide to state management with Angular signals.

## What Are Signals?

Signals are Angular's reactive primitives for managing state. They automatically track dependencies and notify Angular when values change, enabling fine-grained reactivity and optimal change detection.

## Core Signal Types

### 1. Writable Signals

Created with `signal()` - can be updated with `set()` or `update()`.

```typescript
import { signal } from '@angular/core';

export class CounterComponent {
  // Primitive values
  count = signal(0);
  name = signal('Angular');
  isActive = signal(false);
  
  // Objects
  user = signal<User>({ id: '1', name: 'John' });
  
  // Arrays
  items = signal<Item[]>([]);
  
  // Nullable values
  selectedId = signal<string | null>(null);
}
```

### 2. Computed Signals

Created with `computed()` - read-only, derived from other signals.

```typescript
import { computed } from '@angular/core';

export class ShoppingCartComponent {
  items = signal<CartItem[]>([]);
  taxRate = signal(0.08);
  
  // Computed signals automatically recalculate
  subtotal = computed(() => 
    this.items().reduce((sum, item) => sum + item.price * item.quantity, 0)
  );
  
  tax = computed(() => this.subtotal() * this.taxRate());
  
  total = computed(() => this.subtotal() + this.tax());
  
  itemCount = computed(() => 
    this.items().reduce((count, item) => count + item.quantity, 0)
  );
}
```

## Updating Signals

### Use set() for Complete Replacement

```typescript
count = signal(0);
user = signal<User | null>(null);

reset() {
  this.count.set(0);
}

setUser(user: User) {
  this.user.set(user);
}

clearUser() {
  this.user.set(null);
}
```

### Use update() for Transformations

```typescript
count = signal(0);
items = signal<Item[]>([]);

increment() {
  this.count.update(current => current + 1);
}

decrement() {
  this.count.update(current => current - 1);
}

addItem(item: Item) {
  this.items.update(current => [...current, item]);
}

removeItem(id: string) {
  this.items.update(current => current.filter(item => item.id !== id));
}

updateItem(id: string, changes: Partial<Item>) {
  this.items.update(current =>
    current.map(item =>
      item.id === id ? { ...item, ...changes } : item
    )
  );
}
```

### DO NOT Use mutate()

**WRONG - Never use mutate():**
```typescript
items = signal<Item[]>([]);

// ❌ DON'T DO THIS
addItem(item: Item) {
  this.items.mutate(arr => arr.push(item));
}
```

**CORRECT - Use update() instead:**
```typescript
items = signal<Item[]>([]);

// ✅ DO THIS
addItem(item: Item) {
  this.items.update(items => [...items, item]);
}
```

## Reading Signal Values

Always call signals as functions to read their value:

```typescript
count = signal(0);
user = signal<User>({ id: '1', name: 'John' });

logValues() {
  // ✅ CORRECT - call as function
  console.log(this.count());
  console.log(this.user().name);
  
  // ❌ WRONG - don't access without calling
  // console.log(this.count);
  // console.log(this.user);
}
```

## Computed Signal Patterns

### Filtering

```typescript
allItems = signal<Item[]>([]);
searchQuery = signal('');
activeOnly = signal(false);

filteredItems = computed(() => {
  let items = this.allItems();
  
  // Filter by search query
  const query = this.searchQuery().toLowerCase();
  if (query) {
    items = items.filter(item =>
      item.name.toLowerCase().includes(query)
    );
  }
  
  // Filter by active status
  if (this.activeOnly()) {
    items = items.filter(item => item.isActive);
  }
  
  return items;
});
```

### Sorting

```typescript
items = signal<Item[]>([]);
sortBy = signal<'name' | 'date' | 'price'>('name');
sortOrder = signal<'asc' | 'desc'>('asc');

sortedItems = computed(() => {
  const items = [...this.items()];
  const order = this.sortOrder();
  
  items.sort((a, b) => {
    let comparison = 0;
    
    switch (this.sortBy()) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'date':
        comparison = a.date.getTime() - b.date.getTime();
        break;
      case 'price':
        comparison = a.price - b.price;
        break;
    }
    
    return order === 'asc' ? comparison : -comparison;
  });
  
  return items;
});
```

### Aggregations

```typescript
transactions = signal<Transaction[]>([]);

statistics = computed(() => {
  const txs = this.transactions();
  
  return {
    total: txs.reduce((sum, tx) => sum + tx.amount, 0),
    count: txs.length,
    average: txs.length > 0 
      ? txs.reduce((sum, tx) => sum + tx.amount, 0) / txs.length 
      : 0,
    max: Math.max(...txs.map(tx => tx.amount)),
    min: Math.min(...txs.map(tx => tx.amount))
  };
});
```

### Complex Derivations

```typescript
users = signal<User[]>([]);
roles = signal<Role[]>([]);
permissions = signal<Permission[]>([]);

userPermissionMap = computed(() => {
  const users = this.users();
  const roles = this.roles();
  const permissions = this.permissions();
  
  return users.map(user => ({
    userId: user.id,
    userName: user.name,
    permissions: user.roleIds
      .flatMap(roleId => roles.find(r => r.id === roleId)?.permissionIds ?? [])
      .map(permId => permissions.find(p => p.id === permId))
      .filter((p): p is Permission => p !== undefined)
  }));
});
```

## Signal Composition

### Chaining Computed Signals

```typescript
// Base signals
firstName = signal('John');
lastName = signal('Doe');
age = signal(30);

// First level computed
fullName = computed(() => `${this.firstName()} ${this.lastName()}`);
isAdult = computed(() => this.age() >= 18);

// Second level computed (depends on other computed signals)
greeting = computed(() => 
  `Hello, ${this.fullName()}! You are ${this.isAdult() ? 'an adult' : 'a minor'}.`
);
```

### Multiple Dependencies

```typescript
quantity = signal(1);
price = signal(100);
taxRate = signal(0.08);
discountPercent = signal(10);

// Depends on multiple signals
subtotal = computed(() => this.quantity() * this.price());

discount = computed(() => this.subtotal() * (this.discountPercent() / 100));

tax = computed(() => (this.subtotal() - this.discount()) * this.taxRate());

total = computed(() => this.subtotal() - this.discount() + this.tax());
```

## State Management Patterns

### Form State

```typescript
export class FormComponent {
  // Form field signals
  email = signal('');
  password = signal('');
  rememberMe = signal(false);
  
  // Validation computed signals
  isEmailValid = computed(() => {
    const email = this.email();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  });
  
  isPasswordValid = computed(() => this.password().length >= 8);
  
  isFormValid = computed(() => 
    this.isEmailValid() && this.isPasswordValid()
  );
  
  // Form state
  isSubmitting = signal(false);
  error = signal<string | null>(null);
  
  async submit() {
    if (!this.isFormValid()) return;
    
    this.isSubmitting.set(true);
    this.error.set(null);
    
    try {
      await this.authService.login(this.email(), this.password());
    } catch (err) {
      this.error.set(err.message);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
```

### Loading State

```typescript
export class DataComponent {
  // State signals
  isLoading = signal(false);
  error = signal<Error | null>(null);
  data = signal<Data[]>([]);
  
  // Derived state
  hasData = computed(() => this.data().length > 0);
  isEmpty = computed(() => !this.isLoading() && !this.hasData());
  
  async loadData() {
    this.isLoading.set(true);
    this.error.set(null);
    
    try {
      const result = await this.api.fetchData();
      this.data.set(result);
    } catch (err) {
      this.error.set(err);
    } finally {
      this.isLoading.set(false);
    }
  }
}
```

### Pagination State

```typescript
export class PaginatedListComponent {
  allItems = signal<Item[]>([]);
  currentPage = signal(1);
  pageSize = signal(10);
  
  totalPages = computed(() => 
    Math.ceil(this.allItems().length / this.pageSize())
  );
  
  paginatedItems = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    const end = start + this.pageSize();
    return this.allItems().slice(start, end);
  });
  
  canGoNext = computed(() => this.currentPage() < this.totalPages());
  canGoPrevious = computed(() => this.currentPage() > 1);
  
  nextPage() {
    if (this.canGoNext()) {
      this.currentPage.update(page => page + 1);
    }
  }
  
  previousPage() {
    if (this.canGoPrevious()) {
      this.currentPage.update(page => page - 1);
    }
  }
  
  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }
}
```

### Selection State

```typescript
export class SelectableListComponent {
  items = signal<Item[]>([]);
  selectedIds = signal<Set<string>>(new Set());
  
  selectedItems = computed(() => {
    const ids = this.selectedIds();
    return this.items().filter(item => ids.has(item.id));
  });
  
  selectedCount = computed(() => this.selectedIds().size);
  
  isAllSelected = computed(() => 
    this.items().length > 0 && 
    this.selectedCount() === this.items().length
  );
  
  isSomeSelected = computed(() => 
    this.selectedCount() > 0 && 
    !this.isAllSelected()
  );
  
  toggleItem(id: string) {
    this.selectedIds.update(ids => {
      const newIds = new Set(ids);
      if (newIds.has(id)) {
        newIds.delete(id);
      } else {
        newIds.add(id);
      }
      return newIds;
    });
  }
  
  selectAll() {
    const allIds = new Set(this.items().map(item => item.id));
    this.selectedIds.set(allIds);
  }
  
  clearSelection() {
    this.selectedIds.set(new Set());
  }
}
```

## Effects

Use `effect()` for side effects when signals change:

```typescript
import { Component, effect } from '@angular/core';

export class AutoSaveComponent {
  formData = signal({ name: '', email: '' });
  
  constructor() {
    // Auto-save when form data changes
    effect(() => {
      const data = this.formData();
      localStorage.setItem('formData', JSON.stringify(data));
    });
  }
}
```

### Effect Cleanup

```typescript
import { Component, effect } from '@angular/core';

export class WebSocketComponent {
  userId = signal<string | null>(null);
  
  constructor() {
    effect((onCleanup) => {
      const id = this.userId();
      
      if (id) {
        const ws = new WebSocket(`ws://api.com/${id}`);
        
        ws.onmessage = (event) => {
          console.log('Message:', event.data);
        };
        
        // Cleanup function
        onCleanup(() => {
          ws.close();
        });
      }
    });
  }
}
```

## Signal Best Practices

### 1. Pure Transformations

Always use pure functions in `update()` and `computed()`:

```typescript
// ✅ GOOD - pure function
count = signal(0);
increment() {
  this.count.update(n => n + 1);
}

// ❌ BAD - side effect in update
increment() {
  this.count.update(n => {
    console.log('Incrementing'); // Side effect!
    return n + 1;
  });
}
```

### 2. Avoid Deeply Nested Objects

```typescript
// ❌ BAD - deeply nested, hard to update
state = signal({
  user: {
    profile: {
      settings: {
        theme: 'dark'
      }
    }
  }
});

// ✅ GOOD - flattened
userTheme = signal('dark');
userProfile = signal<Profile>({...});
userSettings = signal<Settings>({...});
```

### 3. Keep Computed Signals Simple

```typescript
// ❌ BAD - too complex
complexComputed = computed(() => {
  const items = this.items();
  const filtered = items.filter(item => item.active);
  const sorted = filtered.sort((a, b) => a.name.localeCompare(b.name));
  const grouped = sorted.reduce((groups, item) => {
    // 20 more lines...
  }, {});
  return grouped;
});

// ✅ GOOD - break into smaller computed signals
activeItems = computed(() => 
  this.items().filter(item => item.active)
);

sortedItems = computed(() => 
  [...this.activeItems()].sort((a, b) => a.name.localeCompare(b.name))
);

groupedItems = computed(() => 
  this.sortedItems().reduce((groups, item) => {
    // grouping logic
  }, {})
);
```

### 4. Prefer Signals Over Subjects

```typescript
// ❌ OLD - RxJS Subject
private countSubject = new BehaviorSubject(0);
count$ = this.countSubject.asObservable();

increment() {
  this.countSubject.next(this.countSubject.value + 1);
}

// ✅ NEW - Signal
count = signal(0);

increment() {
  this.count.update(n => n + 1);
}
```

## Signals with Async Data

### Converting Observables to Signals

```typescript
import { toSignal } from '@angular/core/rxjs-interop';

export class UserComponent {
  private userService = inject(UserService);
  
  // Convert observable to signal
  user = toSignal(this.userService.getCurrentUser(), {
    initialValue: null
  });
  
  // Use in computed signals
  userName = computed(() => this.user()?.name ?? 'Guest');
}
```

### Converting Signals to Observables

```typescript
import { toObservable } from '@angular/core/rxjs-interop';

export class SearchComponent {
  searchQuery = signal('');
  
  // Convert signal to observable
  searchQuery$ = toObservable(this.searchQuery);
  
  constructor() {
    // Use with RxJS operators
    this.searchQuery$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => this.api.search(query))
    ).subscribe(results => {
      // Handle results
    });
  }
}
```

## Testing Signals

```typescript
import { signal, computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';

describe('ShoppingCartComponent', () => {
  let component: ShoppingCartComponent;
  
  beforeEach(() => {
    TestBed.configureTestingComponent({
      imports: [ShoppingCartComponent]
    });
    
    const fixture = TestBed.createComponent(ShoppingCartComponent);
    component = fixture.componentInstance;
  });
  
  it('should calculate total correctly', () => {
    component.items.set([
      { id: '1', name: 'Item 1', price: 100, quantity: 2 },
      { id: '2', name: 'Item 2', price: 50, quantity: 1 }
    ]);
    
    expect(component.subtotal()).toBe(250);
  });
  
  it('should update when items change', () => {
    component.items.set([]);
    expect(component.itemCount()).toBe(0);
    
    component.addItem({ id: '1', name: 'Item', price: 100, quantity: 1 });
    expect(component.itemCount()).toBe(1);
  });
});
```
