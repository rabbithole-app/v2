---
name: rxjs-expert
description: Expert RxJS patterns including Necromancer pattern, custom operators, type-safe streams, subscription management with takeUntil/repeat, Angular integration, and reactive best practices. Use when working with RxJS observables, operators, subscriptions, or reactive programming patterns.
allowed-tools: Read, Grep, Edit
---

# RxJS Expert Skill

Я помогу вам применять продвинутые RxJS паттерны из вашего проекта, включая некромант-паттерн (Necromancer), кастомные операторы и интеграцию с Angular.

## Когда использовать этот Skill

- Создание реактивных потоков данных
- Управление подписками (subscribe/unsubscribe)
- Паттерн "некромант" (start/stop/toggle потоков)
- Написание кастомных операторов
- Интеграция RxJS + Angular Signals
- Web Worker коммуникация
- WebSocket переподключение
- Polling с pause/resume
- Type-safe stream операции

## Ключевые паттерны

### 1. Некромант-паттерн (Necromancer Pattern)

Управление жизненным циклом потоков - "убить" и "воскресить" по условию.

**Базовый паттерн:**
```typescript
import { Subject, interval } from 'rxjs';
import { takeUntil, repeat } from 'rxjs/operators';

#stop$ = new Subject<void>();
#start$ = new Subject<void>();

data$ = interval(1000).pipe(
  takeUntil(this.#stop$),        // "убиваем"
  repeat({ delay: () => this.#start$ }) // "воскрешаем"
);

start() { this.#start$.next(); }
stop() { this.#stop$.next(); }
```

**Toggle паттерн:**
```typescript
import { switchMap, NEVER } from 'rxjs';

toggle$ = new Subject<boolean>();

activeData$ = this.toggle$.pipe(
  switchMap(isActive => 
    isActive ? interval(1000) : NEVER
  )
);
```

**WebSocket с переподключением:**
```typescript
import { defer, timer, retry, repeat, shareReplay } from 'rxjs';

connection$ = defer(() => createWebSocket()).pipe(
  takeUntil(disconnect$),
  retry({
    delay: (error, retryCount) => 
      timer(Math.min(1000 * Math.pow(2, retryCount), 30000))
  }),
  repeat({ delay: () => reconnect$ }),
  shareReplay(1)
);
```

**Visibility-based (остановка при скрытой вкладке):**
```typescript
isVisible$ = fromEvent(document, 'visibilitychange').pipe(
  map(() => !document.hidden),
  startWith(!document.hidden),
  distinctUntilChanged()
);

smartPolling$ = isVisible$.pipe(
  switchMap(visible => 
    visible ? interval(2000).pipe(
      switchMap(() => fetchData())
    ) : NEVER
  )
);
```

### 2. Управление подписками с takeUntil

**ВСЕГДА используйте takeUntil для отписки:**

```typescript
// ✅ В Angular компонентах
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

constructor() {
  stream$.pipe(
    takeUntilDestroyed()
  ).subscribe();
}

// ✅ В сервисах/классах
#destroy$ = new Subject<void>();

ngOnInit() {
  stream$.pipe(
    takeUntil(this.#destroy$)
  ).subscribe();
}

ngOnDestroy() {
  this.#destroy$.next();
  this.#destroy$.complete();
}
```

### 3. Кастомные операторы (Type-safe)

**Шаблон для type-safe оператора:**
```typescript
import { Observable, OperatorFunction } from 'rxjs';
import { filter } from 'rxjs/operators';

export function filterByAction<
  T extends Message<Record<string, unknown>>,
  A extends T['action'],
>(action: A): OperatorFunction<T, Extract<T, { action: A }>> {
  return (source: Observable<T>) =>
    source.pipe(
      filter(
        (data): data is Extract<T, { action: A }> => 
          data.action === action
      )
    );
}
```

**Конвертация внешних источников в Observable:**
```typescript
export const toObservable = <T>(source: ExternalSource<T>) =>
  new Observable<T>((subscriber) => {
    const unlisten = source.subscribe(value => 
      subscriber.next(value)
    );
    return () => unlisten(); // Cleanup!
  });
```

### 4. Angular Integration

**Signal ↔ Observable:**
```typescript
import { toSignal, toObservable } from '@angular/core/rxjs-interop';

// Observable → Signal
const mySignal = toSignal(observable$, { initialValue: default });

// Signal → Observable
const myObservable$ = toObservable(mySignal);
```

**Resource → Observable:**
```typescript
import { Resource } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, raceWith, switchMap } from 'rxjs/operators';

const resourceToObservable = <T>(resource: Resource<T>) =>
  toObservable(resource.status).pipe(
    filter(status => status === 'resolved'),
    map(() => resource.value() as NonNullable<T>),
    raceWith(
      toObservable(resource.status).pipe(
        filter(status => status === 'error'),
        switchMap(() => throwError(() => resource.error()))
      )
    )
  );
```

### 5. Subject Best Practices

```typescript
// ✅ ПРАВИЛЬНО: приватный Subject, публичный Observable
class MyService {
  #subject = new Subject<T>();
  public data$ = this.#subject.asObservable();
  
  emit(value: T) {
    this.#subject.next(value);
  }
}

// ❌ НЕПРАВИЛЬНО: публичный Subject
class BadService {
  subject = new Subject<T>(); // Можно манипулировать извне!
}
```

## Инструкции по применению

### Когда пользователь просит создать поток данных:

1. **Определи тип потока:**
   - Холодный (каждая подписка = новое выполнение) → Observable
   - Горячий (разделяемое выполнение) → Subject + shareReplay

2. **Добавь управление жизненным циклом:**
   - Для компонентов: `takeUntilDestroyed()`
   - Для сервисов: `takeUntil(destroy$)`
   - Для условной активации: некромант-паттерн

3. **Обработай ошибки:**
   - Добавь `catchError` с fallback значением
   - Для retry: `retry({ count: 3, delay: exponentialBackoff })`

4. **Оптимизируй:**
   - Избегай вложенных subscribe → используй `switchMap`/`mergeMap`
   - Для HTTP: `switchMap` (отменяет предыдущие)
   - Для параллельных операций: `mergeMap`

### Когда пользователь работает с подписками:

1. **Проверь управление памятью:**
   - Есть ли `takeUntil` или `takeUntilDestroyed`?
   - Используется ли `async` pipe в шаблоне?
   - Есть ли cleanup в ngOnDestroy?

2. **Предложи некромант-паттерн если:**
   - Нужен start/stop/pause/resume
   - Polling с условиями
   - WebSocket с переподключением
   - Работа зависит от видимости вкладки

### Когда пользователь создаёт оператор:

1. **Используй generics для type safety:**
   ```typescript
   function myOperator<T, R>(...): OperatorFunction<T, R>
   ```

2. **Добавь type guards в filter:**
   ```typescript
   filter((x): x is NonNullable<T> => x != null)
   ```

3. **Верни функцию-трансформер:**
   ```typescript
   return (source: Observable<T>) => source.pipe(...)
   ```

## Частые ошибки и решения

### ❌ Вложенные subscribe
```typescript
// Плохо
outer$.subscribe(val1 => {
  inner$.subscribe(val2 => { /* ... */ });
});
```

### ✅ Используй switchMap/mergeMap
```typescript
// Хорошо
outer$.pipe(
  switchMap(val1 => inner$.pipe(
    map(val2 => ({ val1, val2 }))
  ))
).subscribe();
```

### ❌ Забыли отписаться
```typescript
// Плохо - утечка памяти
ngOnInit() {
  stream$.subscribe();
}
```

### ✅ takeUntil или async pipe
```typescript
// Хорошо
stream$.pipe(
  takeUntilDestroyed()
).subscribe();

// Или в шаблоне
// {{ stream$ | async }}
```

### ❌ Публичный Subject
```typescript
// Плохо - нарушение инкапсуляции
public data = new Subject();
```

### ✅ Приватный Subject + публичный Observable
```typescript
// Хорошо
#data = new Subject();
data$ = this.#data.asObservable();
```

## Операторы по категориям

### Создание
- `from` - из Promise/Array
- `of` - из значений
- `timer` - с задержкой
- `interval` - периодически
- `defer` - ленивое создание

### Трансформация
- `map` - преобразование значений
- `switchMap` - переключение + отмена предыдущих
- `mergeMap` - параллельное выполнение
- `exhaustMap` - игнорирование новых пока выполняется текущий

### Фильтрация
- `filter` - по условию
- `take` - первые N
- `takeUntil` - до события
- `distinctUntilChanged` - только изменения
- `first` - первое значение

### Комбинирование
- `merge` - слияние потоков
- `combineLatest` - последние значения всех
- `switchMap` - переключение между потоками
- `mergeWith` - instance operator для merge
- `combineLatestWith` - instance operator

### Утилиты
- `tap` - side effects
- `retry` - повтор при ошибке
- `repeat` - повтор после complete
- `catchError` - обработка ошибок
- `shareReplay` - разделение подписки

## Дополнительные ресурсы

Для детальных примеров и документации см. [REFERENCE.md](REFERENCE.md)
Для примеров из кодовой базы см. [EXAMPLES.md](EXAMPLES.md)

## Контрольный чеклист

Перед тем как предложить решение, проверь:

- [ ] Есть ли управление подписками (takeUntil)?
- [ ] Используются ли type guards для type safety?
- [ ] Нет ли вложенных subscribe?
- [ ] Есть ли обработка ошибок (catchError)?
- [ ] Приватные ли Subjects с публичными Observable?
- [ ] Используется ли правильный оператор комбинирования?
- [ ] Для Angular: используется ли toSignal где уместно?
- [ ] Для условной активации: рассмотрен ли некромант-паттерн?

## Принципы работы

1. **Всегда предлагай type-safe решения** с TypeScript generics
2. **Приоритет операторам над subscribe** - декларативный стиль
3. **Память важна** - всегда добавляй механизм отписки
4. **Используй паттерны проекта** - смотри примеры в кодовой базе
5. **Объясняй выбор операторов** - почему switchMap, а не mergeMap
6. **Предлагай некромант-паттерн** для динамического управления
7. **Интегрируй с Angular правильно** - Signals + Observables гибридно