# Forms Best Practices Reference

Comprehensive guide to forms in Angular 20+ with Reactive Forms patterns.

## Reactive Forms Overview

Reactive Forms provide a model-driven approach to handling form inputs with explicit, immutable, and synchronous form control.

### Why Reactive Forms?

- **Explicit state management** - Form state is explicit and predictable
- **Immutable** - Changes create new states, not mutations
- **Synchronous** - No async validation unless explicitly defined
- **Testable** - Easy to test without DOM
- **Scalable** - Better for complex forms and dynamic controls

## Basic Form Setup

### Simple Form

```typescript
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-user-form',
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()">
      <div>
        <label for="name">Name</label>
        <input id="name" formControlName="name" />
        @if (form.controls.name.errors?.['required'] && form.controls.name.touched) {
          <span class="error">Name is required</span>
        }
      </div>
      
      <div>
        <label for="email">Email</label>
        <input id="email" type="email" formControlName="email" />
        @if (form.controls.email.errors?.['email'] && form.controls.email.touched) {
          <span class="error">Invalid email</span>
        }
      </div>
      
      <button type="submit" [disabled]="form.invalid">Submit</button>
    </form>
  `
})
export class UserFormComponent {
  private fb = inject(FormBuilder);
  
  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]]
  });
  
  onSubmit() {
    if (this.form.valid) {
      console.log(this.form.value);
    }
  }
}
```

### Typed Forms

```typescript
interface UserForm {
  name: string;
  email: string;
  age: number;
}

export class TypedFormComponent {
  private fb = inject(FormBuilder);
  
  form = this.fb.group<UserForm>({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    age: [0, [Validators.required, Validators.min(18)]]
  });
  
  onSubmit() {
    const value: Partial<UserForm> = this.form.value;
    // Type-safe form value
  }
}
```

## Form State with Signals

### Reactive Forms + Signals Pattern

```typescript
import { Component, signal, computed } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';

export class FormWithSignalsComponent {
  private fb = inject(FormBuilder);
  
  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });
  
  // Form state signals
  isSubmitting = signal(false);
  error = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  
  // Computed form state
  isValid = computed(() => this.form.valid);
  hasErrors = computed(() => this.error() !== null);
  
  async onSubmit() {
    if (this.form.invalid) return;
    
    this.isSubmitting.set(true);
    this.error.set(null);
    this.successMessage.set(null);
    
    try {
      await this.apiService.submitForm(this.form.value);
      this.successMessage.set('Form submitted successfully');
      this.form.reset();
    } catch (err) {
      this.error.set(err.message);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
```

### Convert FormControl to Signal

```typescript
import { toSignal } from '@angular/core/rxjs-interop';

export class FormSignalComponent {
  form = this.fb.group({
    search: ['']
  });
  
  // Convert FormControl value to signal
  searchValue = toSignal(
    this.form.controls.search.valueChanges,
    { initialValue: '' }
  );
  
  // Use in computed signals
  hasSearchQuery = computed(() => this.searchValue().length > 0);
  
  filteredResults = computed(() => {
    const query = this.searchValue().toLowerCase();
    return this.items().filter(item => 
      item.name.toLowerCase().includes(query)
    );
  });
}
```

## Validators

### Built-in Validators

```typescript
form = this.fb.group({
  // Required
  name: ['', Validators.required],
  
  // Min/Max length
  username: ['', [
    Validators.required,
    Validators.minLength(3),
    Validators.maxLength(20)
  ]],
  
  // Min/Max value
  age: [0, [
    Validators.required,
    Validators.min(18),
    Validators.max(120)
  ]],
  
  // Email
  email: ['', [Validators.required, Validators.email]],
  
  // Pattern
  phone: ['', [
    Validators.required,
    Validators.pattern(/^\+?[1-9]\d{1,14}$/)
  ]],
  
  // Multiple validators
  password: ['', [
    Validators.required,
    Validators.minLength(8),
    Validators.pattern(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/)
  ]]
});
```

### Custom Validators

```typescript
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// Custom validator function
function passwordStrength(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    
    if (!value) {
      return null;
    }
    
    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumeric = /[0-9]/.test(value);
    const hasSpecialChar = /[!@#$%^&*]/.test(value);
    
    const valid = hasUpperCase && hasLowerCase && hasNumeric && hasSpecialChar;
    
    return valid ? null : { passwordStrength: true };
  };
}

// Usage
form = this.fb.group({
  password: ['', [
    Validators.required,
    Validators.minLength(8),
    passwordStrength()
  ]]
});
```

### Cross-Field Validators

```typescript
// Password confirmation validator
function passwordMatch(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    
    return password === confirmPassword ? null : { passwordMismatch: true };
  };
}

// Usage
form = this.fb.group({
  password: ['', [Validators.required, Validators.minLength(8)]],
  confirmPassword: ['', Validators.required]
}, { validators: passwordMatch() });
```

### Async Validators

```typescript
import { AsyncValidatorFn } from '@angular/forms';
import { map, catchError, debounceTime, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';

function usernameAvailable(userService: UserService): AsyncValidatorFn {
  return (control: AbstractControl) => {
    if (!control.value) {
      return of(null);
    }
    
    return of(control.value).pipe(
      debounceTime(300),
      switchMap(username => 
        userService.checkUsername(username).pipe(
          map(available => available ? null : { usernameTaken: true }),
          catchError(() => of(null))
        )
      )
    );
  };
}

// Usage
form = this.fb.group({
  username: [
    '',
    [Validators.required],
    [usernameAvailable(this.userService)]
  ]
});
```

## Form Arrays

### Basic Form Array

```typescript
import { FormArray } from '@angular/forms';

export class FormArrayComponent {
  private fb = inject(FormBuilder);
  
  form = this.fb.group({
    name: [''],
    phones: this.fb.array([
      this.fb.control('')
    ])
  });
  
  get phones() {
    return this.form.controls.phones;
  }
  
  addPhone() {
    this.phones.push(this.fb.control(''));
  }
  
  removePhone(index: number) {
    this.phones.removeAt(index);
  }
}
```

```html
<!-- Template -->
<form [formGroup]="form">
  <input formControlName="name" />
  
  <div formArrayName="phones">
    @for (phone of phones.controls; track $index) {
      <div>
        <input [formControlName]="$index" />
        <button type="button" (click)="removePhone($index)">Remove</button>
      </div>
    }
  </div>
  
  <button type="button" (click)="addPhone()">Add Phone</button>
</form>
```

### Complex Form Array

```typescript
interface Address {
  street: string;
  city: string;
  zipCode: string;
}

export class AddressFormComponent {
  private fb = inject(FormBuilder);
  
  form = this.fb.group({
    addresses: this.fb.array<FormGroup<Address>>([])
  });
  
  get addresses() {
    return this.form.controls.addresses;
  }
  
  createAddressGroup(): FormGroup {
    return this.fb.group({
      street: ['', Validators.required],
      city: ['', Validators.required],
      zipCode: ['', [Validators.required, Validators.pattern(/^\d{5}$/)]]
    });
  }
  
  addAddress() {
    this.addresses.push(this.createAddressGroup());
  }
  
  removeAddress(index: number) {
    this.addresses.removeAt(index);
  }
}
```

```html
<form [formGroup]="form">
  <div formArrayName="addresses">
    @for (address of addresses.controls; track $index) {
      <div [formGroupName]="$index">
        <input formControlName="street" placeholder="Street" />
        <input formControlName="city" placeholder="City" />
        <input formControlName="zipCode" placeholder="Zip Code" />
        <button type="button" (click)="removeAddress($index)">Remove</button>
      </div>
    }
  </div>
  
  <button type="button" (click)="addAddress()">Add Address</button>
</form>
```

## Nested Form Groups

```typescript
export class NestedFormComponent {
  private fb = inject(FormBuilder);
  
  form = this.fb.group({
    personalInfo: this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      dateOfBirth: ['', Validators.required]
    }),
    contactInfo: this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.required]
    }),
    address: this.fb.group({
      street: [''],
      city: [''],
      state: [''],
      zipCode: ['']
    })
  });
}
```

```html
<form [formGroup]="form">
  <div formGroupName="personalInfo">
    <input formControlName="firstName" />
    <input formControlName="lastName" />
    <input formControlName="dateOfBirth" type="date" />
  </div>
  
  <div formGroupName="contactInfo">
    <input formControlName="email" type="email" />
    <input formControlName="phone" />
  </div>
  
  <div formGroupName="address">
    <input formControlName="street" />
    <input formControlName="city" />
    <input formControlName="state" />
    <input formControlName="zipCode" />
  </div>
</form>
```

## Dynamic Forms

### Form from Configuration

```typescript
interface FieldConfig {
  name: string;
  type: 'text' | 'email' | 'number' | 'select';
  label: string;
  required?: boolean;
  options?: { value: string; label: string; }[];
}

export class DynamicFormComponent {
  private fb = inject(FormBuilder);
  
  fields = signal<FieldConfig[]>([
    { name: 'name', type: 'text', label: 'Name', required: true },
    { name: 'email', type: 'email', label: 'Email', required: true },
    { name: 'age', type: 'number', label: 'Age' }
  ]);
  
  form = computed(() => {
    const group: Record<string, any> = {};
    
    this.fields().forEach(field => {
      const validators = [];
      if (field.required) {
        validators.push(Validators.required);
      }
      group[field.name] = ['', validators];
    });
    
    return this.fb.group(group);
  });
}
```

## Form Value Management

### Getting Form Values

```typescript
form = this.fb.group({
  name: ['John'],
  email: ['john@example.com'],
  age: [30]
});

getValues() {
  // Get all values (includes disabled controls)
  const rawValue = this.form.getRawValue();
  
  // Get values (excludes disabled controls)
  const value = this.form.value;
  
  // Get specific control value
  const name = this.form.controls.name.value;
}
```

### Setting Form Values

```typescript
form = this.fb.group({
  name: [''],
  email: [''],
  age: [0]
});

setValues() {
  // Set all values (must match structure exactly)
  this.form.setValue({
    name: 'John',
    email: 'john@example.com',
    age: 30
  });
  
  // Patch values (partial update)
  this.form.patchValue({
    name: 'John'
  });
  
  // Set individual control
  this.form.controls.name.setValue('John');
}
```

### Resetting Forms

```typescript
resetForm() {
  // Reset to initial values
  this.form.reset();
  
  // Reset with new values
  this.form.reset({
    name: 'Default',
    email: ''
  });
  
  // Reset and mark as untouched/pristine
  this.form.reset();
  this.form.markAsUntouched();
  this.form.markAsPristine();
}
```

## Form State

### Checking Form State

```typescript
checkState() {
  // Validity
  const isValid = this.form.valid;
  const isInvalid = this.form.invalid;
  
  // Touched/Untouched
  const isTouched = this.form.touched;
  const isUntouched = this.form.untouched;
  
  // Dirty/Pristine
  const isDirty = this.form.dirty;
  const isPristine = this.form.pristine;
  
  // Pending (async validation in progress)
  const isPending = this.form.pending;
  
  // Disabled/Enabled
  const isDisabled = this.form.disabled;
  const isEnabled = this.form.enabled;
}
```

### Updating Form State

```typescript
updateState() {
  // Mark as touched
  this.form.markAsTouched();
  this.form.markAllAsTouched();
  
  // Mark as untouched
  this.form.markAsUntouched();
  
  // Mark as dirty
  this.form.markAsDirty();
  
  // Mark as pristine
  this.form.markAsPristine();
  
  // Disable/Enable
  this.form.disable();
  this.form.enable();
  
  // Disable specific control
  this.form.controls.email.disable();
  this.form.controls.email.enable();
}
```

## Error Handling

### Displaying Errors

```html
<form [formGroup]="form">
  <div>
    <label for="email">Email</label>
    <input id="email" formControlName="email" />
    
    @if (form.controls.email.errors && form.controls.email.touched) {
      <div class="errors">
        @if (form.controls.email.errors['required']) {
          <span>Email is required</span>
        }
        @if (form.controls.email.errors['email']) {
          <span>Invalid email format</span>
        }
      </div>
    }
  </div>
</form>
```

### Error Helper Function

```typescript
export class FormComponent {
  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });
  
  getError(controlName: string): string | null {
    const control = this.form.get(controlName);
    
    if (!control || !control.errors || !control.touched) {
      return null;
    }
    
    if (control.errors['required']) {
      return 'This field is required';
    }
    
    if (control.errors['email']) {
      return 'Invalid email format';
    }
    
    if (control.errors['minlength']) {
      const minLength = control.errors['minlength'].requiredLength;
      return `Minimum length is ${minLength}`;
    }
    
    return 'Invalid value';
  }
}
```

```html
<input formControlName="email" />
@if (getError('email'); as error) {
  <span class="error">{{ error }}</span>
}
```

## Form Submission

### Handling Submit

```typescript
export class SubmitFormComponent {
  private fb = inject(FormBuilder);
  
  form = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]]
  });
  
  isSubmitting = signal(false);
  error = signal<string | null>(null);
  
  async onSubmit() {
    // Mark all as touched to show validation errors
    this.form.markAllAsTouched();
    
    if (this.form.invalid) {
      return;
    }
    
    this.isSubmitting.set(true);
    this.error.set(null);
    
    try {
      const response = await this.api.submitForm(this.form.value);
      console.log('Success:', response);
      this.form.reset();
    } catch (err) {
      this.error.set(err.message);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
```

```html
<form [formGroup]="form" (ngSubmit)="onSubmit()">
  <input formControlName="name" />
  <input formControlName="email" />
  
  @if (error(); as errorMsg) {
    <div class="error">{{ errorMsg }}</div>
  }
  
  <button 
    type="submit" 
    [disabled]="form.invalid || isSubmitting()">
    @if (isSubmitting()) {
      Submitting...
    } @else {
      Submit
    }
  </button>
</form>
```

## Best Practices

### 1. Use FormBuilder

```typescript
// ✅ GOOD - Use FormBuilder
private fb = inject(FormBuilder);
form = this.fb.group({
  name: ['', Validators.required]
});

// ❌ BAD - Manual FormGroup creation
form = new FormGroup({
  name: new FormControl('', Validators.required)
});
```

### 2. Type Your Forms

```typescript
interface LoginForm {
  email: string;
  password: string;
}

// ✅ GOOD - Typed form
form = this.fb.group<LoginForm>({
  email: ['', Validators.required],
  password: ['', Validators.required]
});
```

### 3. Extract Complex Validators

```typescript
// ✅ GOOD - Reusable validator
const passwordValidator = () => Validators.compose([
  Validators.required,
  Validators.minLength(8),
  passwordStrength()
]);

form = this.fb.group({
  password: ['', passwordValidator()]
});
```

### 4. Handle Async Operations Properly

```typescript
// ✅ GOOD - Track loading state
async onSubmit() {
  this.isSubmitting.set(true);
  try {
    await this.api.submit(this.form.value);
  } finally {
    this.isSubmitting.set(false);
  }
}
```

### 5. Clean Up Subscriptions

```typescript
// ✅ GOOD - Use takeUntilDestroyed
private destroyRef = inject(DestroyRef);

constructor() {
  this.form.valueChanges
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(value => {
      console.log('Form changed:', value);
    });
}
```

### 6. Validate Before Submit

```typescript
// ✅ GOOD - Always validate
onSubmit() {
  this.form.markAllAsTouched();
  
  if (this.form.invalid) {
    return;
  }
  
  // Submit logic
}
```

## Signal Forms (Angular 21+)

**Note:** Signal Forms are experimental in Angular 21+. They provide a new approach to forms using signals and schema-based validation.

### Basic Signal Form

```typescript
import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { form, schema, Field, required, email, minLength } from '@angular/forms/signals';

// 1. Define interface
interface User {
  name: string;
  email: string;
}

// 2. Define validation schema
const userSchema = schema<User>((f) => {
  required(f.name, { message: 'Name is required' });
  minLength(f.name, 3, { message: 'Name must be at least 3 characters' });
  required(f.email, { message: 'Email is required' });
  email(f.email, { message: 'Enter a valid email address' });
});

// 3. Create component
@Component({
  selector: 'app-user-form',
  imports: [Field],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form (ngSubmit)="onSubmit()">
      <div>
        <input type="text" placeholder="Name" [field]="userForm.name" />
        @if (userForm.name().touched() || userForm.name().dirty()) {
          @for (error of userForm.name().errors(); track error.kind) {
            <p class="error">{{ error.message }}</p>
          }
        }
      </div>

      <div>
        <input type="email" placeholder="Email" [field]="userForm.email" />
        @if (userForm.email().touched() || userForm.email().dirty()) {
          @for (error of userForm.email().errors(); track error.kind) {
            <p class="error">{{ error.message }}</p>
          }
        }
      </div>

      <button type="submit" [disabled]="!userForm().valid()">Submit</button>
    </form>
  `
})
export class UserFormComponent {
  // Initialize state signal
  user = signal<User>({ name: '', email: '' });

  // Create form with validation
  userForm = form(this.user, userSchema);

  onSubmit(): void {
    if (this.userForm().valid()) {
      console.log('Valid data:', this.user());
    }
  }
}
```

### Signal Form Validators

```typescript
import {
  schema,
  required,
  email,
  minLength,
  maxLength,
  min,
  max,
  pattern,
  validate,
  customError,
  applyEach
} from '@angular/forms/signals';

const formSchema = schema<FormData>((f) => {
  // Required field
  required(f.name, { message: 'Name is required' });

  // Email validation
  email(f.email, { message: 'Invalid email format' });

  // String length
  minLength(f.password, 8, { message: 'Password must be at least 8 characters' });
  maxLength(f.bio, 500, { message: 'Bio cannot exceed 500 characters' });

  // Number range
  min(f.age, 18, { message: 'Must be at least 18' });
  max(f.quantity, 100, { message: 'Maximum 100 items' });

  // Regex pattern
  pattern(f.phone, /^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number' });
  pattern(f.zip, /^\d{5}$/, { message: 'ZIP must be 5 digits' });
});
```

### Custom Validation

```typescript
const formSchema = schema<User>((f) => {
  required(f.username);

  // Custom validation logic
  validate(f.username, (field) => {
    const value = field.value();
    if (value && !/^[a-zA-Z]/.test(value)) {
      return customError({
        kind: 'pattern',
        message: 'Username must start with a letter'
      });
    }
    return null;
  });

  // Password strength validation
  validate(f.password, (field) => {
    const value = field.value();
    if (!value) return null;

    if (value.length < 8) {
      return customError({
        kind: 'minLength',
        message: 'At least 8 characters'
      });
    }
    if (!/[A-Z]/.test(value)) {
      return customError({
        kind: 'pattern',
        message: 'Include an uppercase letter'
      });
    }
    if (!/[0-9]/.test(value)) {
      return customError({
        kind: 'pattern',
        message: 'Include a number'
      });
    }
    return null;
  });
});
```

### Cross-Field Validation

```typescript
interface SignupForm {
  password: string;
  confirmPassword: string;
}

const signupSchema = schema<SignupForm>((f) => {
  required(f.password, { message: 'Password is required' });
  minLength(f.password, 8, { message: 'At least 8 characters' });
  required(f.confirmPassword, { message: 'Please confirm password' });

  // Cross-field validation
  validate(f.confirmPassword, (field) => {
    const password = f.password.value();
    const confirm = field.value();

    if (confirm && password !== confirm) {
      return customError({
        kind: 'passwordMismatch',
        message: 'Passwords do not match'
      });
    }
    return null;
  });
});
```

### Nested Objects

```typescript
interface Address {
  street: string;
  city: string;
  zip: string;
}

interface User {
  name: string;
  address: Address;
}

const userSchema = schema<User>((f) => {
  required(f.name, { message: 'Name is required' });

  // Nested validation
  required(f.address.street, { message: 'Street is required' });
  required(f.address.city, { message: 'City is required' });
  required(f.address.zip, { message: 'ZIP is required' });
  pattern(f.address.zip, /^\d{5}$/, { message: 'ZIP must be 5 digits' });
});

@Component({
  template: `
    <input [field]="userForm.name" placeholder="Name" />
    <input [field]="userForm.address.street" placeholder="Street" />
    <input [field]="userForm.address.city" placeholder="City" />
    <input [field]="userForm.address.zip" placeholder="ZIP" />
  `
})
export class AddressFormComponent {
  user = signal<User>({
    name: '',
    address: { street: '', city: '', zip: '' }
  });
  userForm = form(this.user, userSchema);
}
```

### Dynamic Arrays

```typescript
interface Hobby {
  name: string;
  years: number;
}

interface User {
  name: string;
  hobbies: Hobby[];
}

const userSchema = schema<User>((f) => {
  required(f.name);

  // Validate each array item
  applyEach(f.hobbies, (hobby) => {
    required(hobby.name, { message: 'Hobby name is required' });
    min(hobby.years, 0, { message: 'Years must be positive' });
  });
});

@Component({
  template: `
    <input [field]="userForm.name" placeholder="Name" />
    
    @for (hobby of userForm.hobbies; track hobby; let i = $index) {
      <div class="hobby-row">
        <input [field]="hobby.name" placeholder="Hobby" />
        <input [field]="hobby.years" type="number" placeholder="Years" />
        <button type="button" (click)="removeHobby(i)">Remove</button>
      </div>
    } @empty {
      <p>No hobbies added</p>
    }
    <button type="button" (click)="addHobby()">Add Hobby</button>
  `
})
export class HobbyFormComponent {
  user = signal<User>({ name: '', hobbies: [] });
  userForm = form(this.user, userSchema);

  addHobby(): void {
    this.user.update(u => ({
      ...u,
      hobbies: [...u.hobbies, { name: '', years: 0 }]
    }));
  }

  removeHobby(index: number): void {
    this.user.update(u => ({
      ...u,
      hobbies: u.hobbies.filter((_, i) => i !== index)
    }));
  }
}
```

### Field State Properties

```typescript
// Access field state
const field = userForm.name();

// State properties (all are signals)
field.value()         // Current value (may be debounced)
field.controlValue()  // Non-debounced value
field.valid()         // Is valid
field.invalid()       // Is invalid
field.errors()        // Array of { kind, message }
field.touched()       // User has blurred
field.dirty()         // Value has changed
field.pending()       // Async validation in progress
field.disabled()      // Is disabled
field.hidden()        // Is hidden
field.readonly()      // Is read-only

// Methods
field.reset()         // Mark pristine and untouched
field.markAsTouched() // Mark as touched
field.markAsDirty()   // Mark as dirty
```

### Signal Forms with Computed State

```typescript
@Component({
  template: `
    <form (ngSubmit)="onSubmit()">
      <!-- fields -->
      <button type="submit" [disabled]="!canSubmit()">Submit</button>
      
      <div class="form-info">
        <p>Form valid: {{ isValid() }}</p>
        <p>Has changes: {{ isDirty() }}</p>
        <p>Error count: {{ errorCount() }}</p>
      </div>
    </form>
  `
})
export class SignalFormComponent {
  user = signal<User>({ name: '', email: '' });
  userForm = form(this.user, userSchema);

  // Computed form state
  readonly isValid = computed(() => this.userForm().valid());
  
  readonly isDirty = computed(() => 
    this.userForm.name().dirty() || this.userForm.email().dirty()
  );
  
  readonly canSubmit = computed(() => 
    this.isValid() && this.isDirty()
  );
  
  readonly errorCount = computed(() => 
    this.userForm.name().errors().length + 
    this.userForm.email().errors().length
  );
}
```

### Reusable Schemas

```typescript
// src/app/validation/user.validation.ts
import { schema, required, email, min, max } from '@angular/forms/signals';

export interface User {
  name: string;
  email: string;
  age: number;
}

// Export reusable schema
export const userValidation = schema<User>((f) => {
  required(f.name, { message: 'Name is required' });
  required(f.email, { message: 'Email is required' });
  email(f.email, { message: 'Invalid email' });
  min(f.age, 18, { message: 'Must be 18 or older' });
  max(f.age, 120, { message: 'Invalid age' });
});

// Usage in component
import { userValidation } from '@app/validation/user.validation';

export class UserFormComponent {
  user = signal<User>({ name: '', email: '', age: 0 });
  userForm = form(this.user, userValidation);
}
```

### Signal Forms vs Reactive Forms

| Feature | Signal Forms | Reactive Forms |
|---------|-------------|----------------|
| **API** | `form()`, `schema()` | `FormBuilder`, `FormGroup` |
| **State** | Signals | Observables |
| **Validation** | Schema-based | Validator functions |
| **Type Safety** | Built-in | Manual typing |
| **Change Detection** | Automatic (signals) | Manual or OnPush |
| **Learning Curve** | Simpler | Steeper |
| **Maturity** | Experimental (21+) | Stable |

### When to Use Signal Forms

**Use Signal Forms when:**
- Starting a new Angular 21+ project
- You prefer declarative schema validation
- You want automatic type inference
- You're already using signals heavily
- You need simpler API for basic forms

**Use Reactive Forms when:**
- Working on existing projects
- You need proven, stable API
- Complex dynamic form requirements
- Team is familiar with Reactive Forms
- You need broader ecosystem support

### Signal Forms Best Practices

```typescript
// ✅ GOOD - Organize schemas separately
// user.validation.ts
export const userSchema = schema<User>((f) => {
  required(f.name);
  email(f.email);
});

// ✅ GOOD - Use computed for form state
readonly canSubmit = computed(() => 
  this.userForm().valid() && this.userForm().dirty()
);

// ✅ GOOD - Show errors only when appropriate
@if (field().touched() || field().dirty()) {
  @for (error of field().errors(); track error.kind) {
    <span>{{ error.message }}</span>
  }
}

// ✅ GOOD - Use OnPush change detection
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush
})

// ❌ BAD - Don't mix Reactive Forms and Signal Forms
// Pick one approach per form
```

### Migration from Reactive Forms

```typescript
// Before - Reactive Forms
export class OldComponent {
  private fb = inject(FormBuilder);
  
  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]]
  });
  
  get nameControl() {
    return this.form.get('name');
  }
}

// After - Signal Forms
export class NewComponent {
  user = signal({ name: '', email: '' });
  
  userForm = form(this.user, schema<User>((f) => {
    required(f.name);
    minLength(f.name, 3);
    required(f.email);
    email(f.email);
  }));
  
  // Direct access, no getter needed
  // Use: userForm.name()
}
```
