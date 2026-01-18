# RxJS Examples from Codebase

Реальные примеры использования RxJS паттернов из проекта Rabbithole.

## Примеры из кодовой базы

### 1. Worker Service - Subject-based коммуникация

**Файл:** `libs/core/src/lib/services/worker.service.ts`

```typescript
import { inject, Injectable, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { map, mergeWith } from 'rxjs/operators';

@Injectable()
export class WorkerService<
  TIn extends Message<{ [key: string]: unknown }>,
  TOut extends Message<{ [key: string]: unknown }>
> {
  worker = inject(WORKER);
  #workerMessage: Subject<MessageEvent<TOut>> = new Subject();
  workerMessage$ = this.#workerMessage.asObservable();
  #terminate = new Subject<void>();
  
  workerInited: Signal<boolean> = toSignal(
    this.workerMessage$.pipe(
      messageByAction('worker:init'),
      map(() => true),
      mergeWith(this.#terminate.asObservable().pipe(map(() => false))),
    ),
    { initialValue: false },
  );

  constructor() {
    this.init();
  }

  init() {
    assertWorker(this.worker);
    this.worker.onmessage = (event) => this.#workerMessage.next(event);
  }

  postMessage(message: TIn, options?: StructuredSerializeOptions) {
    assertWorker(this.worker);
    this.worker.postMessage(message, options);
  }

  terminate() {
    assertWorker(this.worker);
    this.worker.terminate();
    this.#terminate.next();
  }
}
```

**Паттерны:**
- ✅ Приватный Subject, публичный Observable
- ✅ Интеграция с Angular Signals через `toSignal`
- ✅ Комбинирование потоков с `mergeWith`
- ✅ Type-safe с generics

---

### 2. Custom Operator - filterByAction

**Файл:** `libs/core/src/lib/operators/filter-by-action.ts`

```typescript
import { Observable, OperatorFunction } from 'rxjs';
import { filter } from 'rxjs/operators';
import { Message } from '../types';

export function filterByAction<
  T extends Message<Record<string, unknown>>,
  A extends T['action'],
>(action: A): OperatorFunction<T, Extract<T, { action: A }>> {
  return (source: Observable<T>) =>
    source.pipe(
      filter(
        (data): data is Extract<T, { action: A }> => data.action === action,
      ),
    );
}
```

**Паттерны:**
- ✅ Type-safe оператор с полным type inference
- ✅ Type guard для сужения типов
- ✅ Reusable оператор для фильтрации сообщений

**Использование:**
```typescript
messages$.pipe(
  filterByAction('worker:init'),  // Type narrowed to init messages
  map(msg => msg.data)            // TypeScript knows exact type
)
```

---

### 3. Custom Operator - messageByAction

**Файл:** `libs/core/src/lib/operators/message-by-action.ts`

```typescript
import { Observable, OperatorFunction } from 'rxjs';
import { map } from 'rxjs/operators';
import { Message } from '../types';
import { filterByAction } from './filter-by-action';

export function messageByAction<
  T extends MessageEvent<Message<Record<string, unknown>>>,
  A extends T['data']['action'],
>(action: A): OperatorFunction<T, Extract<T['data'], { action: A }>> {
  return (source: Observable<T>) =>
    source.pipe(
      map(({ data }) => data),
      filterByAction(action),
    );
}
```

**Паттерны:**
- ✅ Композиция операторов
- ✅ Извлечение данных из MessageEvent
- ✅ Type-safe фильтрация по action

---

### 4. Resource to Observable

**Файл:** `libs/core/src/lib/operators/resource-to-observable.ts`

```typescript
import { Resource } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { throwError } from 'rxjs';
import { filter, map, raceWith, switchMap } from 'rxjs/operators';

export const resourceToObservable = <T>(resource: Resource<T>) => {
  return toObservable(resource.status).pipe(
    filter((status) => status === 'resolved'),
    map(() => resource.value() as NonNullable<T>),
    raceWith(
      toObservable(resource.status).pipe(
        filter((status) => status === 'error'),
        switchMap(() => throwError(() => resource.error())),
      ),
    ),
  );
};
```

**Паттерны:**
- ✅ Конвертация Angular Resource → Observable
- ✅ Параллельная обработка success/error с `raceWith`
- ✅ Signal → Observable интеграция

**Использование в резолвере:**
```typescript
export const canisterListResolver: ResolveFn<Principal[]> = () => {
  const service = inject(CanistersService);
  return resourceToObservable(service.list).pipe(
    catchError(() => of([]))
  );
};
```

---

### 5. TanStack Store to Observable

**Файл:** `libs/core/src/lib/operators/to-observable-store.ts`

```typescript
import { Store } from '@tanstack/store';
import { Observable } from 'rxjs';

export const toObservableStore = <T>(store: Store<T>) =>
  new Observable<T>((subscriber) => {
    const unlisten = store.subscribe(({ currentVal }) =>
      subscriber.next(currentVal)
    );
    return () => unlisten();
  });
```

**Паттерны:**
- ✅ Кастомный Observable с cleanup
- ✅ Интеграция с внешними store
- ✅ Правильная отписка в teardown

---

### 6. Delegation Expiration Monitoring

**Файл:** `libs/auth/src/lib/operators.ts`

```typescript
import { DelegationChain, isDelegationValid } from '@icp-sdk/core/identity';
import { merge, Observable, timer } from 'rxjs';
import { filter, first, map, switchMap } from 'rxjs/operators';

export const timeInNanosToDate = (time: bigint) =>
  new Date(Number(time / 1_000_000n));

export function waitDelegationExpired() {
  return (source$: Observable<DelegationChain | null>) =>
    source$.pipe(
      filter((v) => v !== null),
      switchMap<DelegationChain, Observable<void>>((delegationChain) => {
        const expirations = delegationChain.delegations.map(({ delegation }) =>
          timer(Number(delegation.expiration / 1_000_000n) - Date.now()),
        );
        return merge(...expirations).pipe(
          first(() => !isDelegationValid(delegationChain)),
          map(() => void 0),
        );
      }),
    );
}
```

**Паттерны:**
- ✅ Мониторинг множественных таймеров
- ✅ Merge для параллельного ожидания
- ✅ First с предикатом для условной отмены
- ✅ Domain-specific оператор для ICP

---

### 7. Custom Repeat Operator

**Файл:** `libs/core/src/lib/operators/custom-repeat-when.ts`

```typescript
import { Observable, ReplaySubject } from 'rxjs';
import { audit, connect, mergeWith } from 'rxjs/operators';

export function customRepeatWhen<T>(
  auditCallback: (v: T) => Observable<unknown>,
) {
  return (source: Observable<T>) =>
    source.pipe(
      connect(
        (shared) => shared.pipe(mergeWith(shared.pipe(audit(auditCallback)))),
        {
          connector: () => new ReplaySubject(1),
        },
      ),
    );
}
```

**Паттерны:**
- ✅ Продвинутое multicast с `connect`
- ✅ ReplaySubject для сохранения последнего значения
- ✅ Кастомная логика повторения с `audit`

---

### 8. Route Guard с Observable

**Файл:** `libs/core/src/lib/guards/dashboard.guard.ts`

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { AUTH_SERVICE } from '@rabbithole/auth';

export const dashboardGuard: CanActivateFn = () => {
  const router = inject(Router);
  const authService = inject(AUTH_SERVICE);
  
  return authService.ready$.pipe(
    filter((v) => v),
    map((ready) => {
      if (ready) {
        return true;
      }
      return new RedirectCommand(router.parseUrl('/login'));
    })
  );
};
```

**Паттерны:**
- ✅ Functional guards с inject()
- ✅ Observable-based navigation
- ✅ Filter для ожидания готовности
- ✅ RedirectCommand для навигации

---

### 9. HTTP Agent с Identity Stream

**Файл:** `libs/core/src/lib/injectors/http-agent.ts`

```typescript
export const [injectHttpAgent, , HTTP_AGENT] = createInjectionToken(() => {
  const authService = inject(AUTH_SERVICE);
  const options = inject(HTTP_AGENT_OPTIONS_TOKEN);
  
  return toSignal(
    toObservable(authService.identity).pipe(
      filter((v) => v !== null),
      switchMap(async (identity) => {
        const agent = await HttpAgent.create({ ...options, identity });
        await agent.fetchRootKey();
        return agent;
      })
    )
  );
});
```

**Паттерны:**
- ✅ Signal → Observable → async → Signal
- ✅ switchMap для отмены предыдущих запросов
- ✅ Filter для null-checking
- ✅ Интеграция с dependency injection

---

### 10. Copy to Clipboard с Timer

**Файл:** `libs/core/src/lib/components/ui/copy-to-clipboard/copy-to-clipboard.component.ts`

```typescript
import { of, Subject, timer } from 'rxjs';
import { map, mergeWith, switchMap } from 'rxjs/operators';

@Component({...})
export class CopyToClipboardComponent {
  #copy = new Subject<void>();
  
  copied = toSignal(
    this.#copy.pipe(
      switchMap(() => of(true).pipe(
        mergeWith(timer(2000).pipe(map(() => false)))
      ))
    ),
    { initialValue: false }
  );
  
  async copyToClipboard() {
    await navigator.clipboard.writeText(this.text());
    this.#copy.next();
  }
}
```

**Паттерны:**
- ✅ User interaction → Subject
- ✅ Immediate feedback + delayed reset
- ✅ Timer для auto-reset состояния
- ✅ Signal для template binding

---

### 11. File List Service - Complex State Management

**Файл:** `libs/features/src/lib/file-list/services/file-list.service.ts`

```typescript
import { Subject, map, mergeAll } from 'rxjs';

@Injectable()
export class FileListService {
  #directories = new Subject<FileSystemDirectoryItem[]>();
  
  directories$ = this.#directories.asObservable().pipe(
    mergeAll(),
    map((item) => convertToNodeItem(item))
  );
  
  selectedItems = signal<Set<bigint>>(new Set());
  
  selectedItemsArray = computed(() => 
    Array.from(this.selectedItems())
  );
}
```

**Паттерны:**
- ✅ Гибридный подход: Observable для потоков, Signal для состояния
- ✅ mergeAll для flatten массива
- ✅ computed для производного состояния
- ✅ Subject как event emitter

---

### 12. Permission Service с Multiple Triggers

**Файл:** `libs/core/src/lib/services/permissions.service.ts`

```typescript
import { Subject, map, mergeMap, mergeWith } from 'rxjs';

@Injectable()
export class PermissionsService {
  #refresh$ = new Subject<void>();
  
  permissions$ = this.#refresh$.pipe(
    mergeWith(authService.identity$.pipe(filter(Boolean))),
    mergeMap(() => this.fetchPermissions()),
    map((permissions) => this.processPermissions(permissions))
  );
  
  refresh() {
    this.#refresh$.next();
  }
}
```

**Паттерны:**
- ✅ Множественные триггеры (manual + auto)
- ✅ mergeWith для комбинирования источников
- ✅ mergeMap для async операций
- ✅ Публичный API для ручного обновления

---

### 13. Navigation с Route Combination

**Файл:** `libs/core/src/lib/components/layout/navigation/navigation.component.ts`

```typescript
import { combineLatestWith, map } from 'rxjs/operators';

@Component({...})
export class NavigationComponent {
  activeItem = toSignal(
    this.navItems$.pipe(
      combineLatestWith(this.router.events),
      map(([items, _]) => this.findActiveItem(items))
    )
  );
}
```

**Паттерны:**
- ✅ Комбинирование нескольких потоков
- ✅ Router events integration
- ✅ Reactive active state
- ✅ Signal для template

---

### 14. Async Validator с Observable

**Файл:** `libs/core/src/lib/services/profile.service.ts`

```typescript
import { AsyncValidatorFn, ValidationErrors } from '@angular/forms';
import { map } from 'rxjs';

usernameExists(): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> => {
    return from(this.actor().usernameExists(control.value)).pipe(
      map((exists) => (exists ? { usernameExists: true } : null))
    );
  };
}
```

**Паттерны:**
- ✅ Promise → Observable с from()
- ✅ Async form validation
- ✅ Observable-based validators

---

### 15. Tauri Deep Link Observable

**Файл:** `libs/utils/src/lib/utils.ts`

```typescript
import { from, Observable } from 'rxjs';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';

export function onOpenUrlObservable() {
  return new Observable<Urls>((subscriber) => {
    let unlisten: UnlistenFn | null = null;
    
    onOpenUrl((urls) => {
      subscriber.next(urls);
    }).then((fn) => {
      unlisten = fn;
    });
    
    return () => {
      unlisten?.();
    };
  });
}
```

**Паттерны:**
- ✅ Custom Observable для внешних API
- ✅ Async cleanup handling
- ✅ Proper teardown logic
- ✅ Интеграция с Tauri events

---

## Некромант-паттерн примеры (не в кодовой базе, но рекомендуемые)

### WebSocket с переподключением

```typescript
@Injectable()
export class WebSocketService {
  #disconnect$ = new Subject<void>();
  #reconnect$ = new Subject<void>();
  
  connection$ = defer(() => this.createWebSocket()).pipe(
    tap(() => console.log('WebSocket connected')),
    takeUntil(this.#disconnect$),
    retry({
      delay: (error, retryCount) => {
        console.log(`Retry attempt ${retryCount}`);
        return timer(Math.min(1000 * Math.pow(2, retryCount), 30000));
      }
    }),
    repeat({ delay: () => this.#reconnect$ }),
    shareReplay(1)
  );
  
  private createWebSocket(): Observable<MessageEvent> {
    return new Observable(subscriber => {
      const ws = new WebSocket('wss://example.com');
      ws.onmessage = (event) => subscriber.next(event);
      ws.onerror = (error) => subscriber.error(error);
      ws.onclose = () => subscriber.complete();
      return () => ws.close();
    });
  }
  
  disconnect() { this.#disconnect$.next(); }
  reconnect() { this.#reconnect$.next(); }
}
```

### Visibility-based Polling

```typescript
@Injectable({ providedIn: 'root' })
export class SmartPollingService {
  isVisible$ = merge(
    fromEvent(document, 'visibilitychange').pipe(
      map(() => !document.hidden)
    ),
    [!document.hidden]
  ).pipe(
    distinctUntilChanged()
  );
  
  data$ = this.isVisible$.pipe(
    switchMap(isVisible => {
      if (isVisible) {
        return interval(2000).pipe(
          switchMap(() => this.fetchData())
        );
      }
      return NEVER;
    })
  );
}
```

## Ключевые выводы

1. **Type Safety везде** - используй generics и type guards
2. **Private Subjects** - всегда скрывай внутреннюю реализацию
3. **Hybrid approach** - Observable для потоков, Signal для состояния
4. **Cleanup обязателен** - takeUntil, takeUntilDestroyed, или teardown
5. **Операторы > subscribe** - декларативный код
6. **Custom operators** - переиспользуемая логика
7. **Integration patterns** - знай как связать RxJS с Angular/ICP/Tauri