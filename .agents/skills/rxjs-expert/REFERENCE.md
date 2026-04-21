# RxJS Reference Documentation

Детальная справочная документация по RxJS операторам, используемым в проекте.

## Table of Contents

- [Creation Operators](#creation-operators)
- [Transformation Operators](#transformation-operators)
- [Filtering Operators](#filtering-operators)
- [Combination Operators](#combination-operators)
- [Error Handling](#error-handling)
- [Utility Operators](#utility-operators)
- [Multicasting](#multicasting)
- [Scheduler Reference](#scheduler-reference)

---

## Creation Operators

### `from`

Конвертирует Promise, array-like объект или итератор в Observable.

```typescript
import { from } from 'rxjs';

// Из Promise
const promise$ = from(fetch('/api/data'));

// Из Array
const array$ = from([1, 2, 3, 4, 5]);

// Из async функции
const async$ = from(async () => {
  const result = await someAsyncOperation();
  return result;
});
```

**Когда использовать:**
- Конвертация Promise в Observable
- Работа с массивами как потоками
- Интеграция с async/await кодом

---

### `of`

Создаёт Observable, который сразу эмитит указанные значения и завершается.

```typescript
import { of } from 'rxjs';

// Один или несколько аргументов
const numbers$ = of(1, 2, 3, 4, 5);

// Fallback значение
const fallback$ = of(null);
const defaultValue$ = of([]);

// В комбинации с catchError
source$.pipe(
  catchError(() => of(defaultValue))
);
```

**Когда использовать:**
- Возврат константных значений
- Fallback в catchError
- Тестирование

---

### `timer`

Создаёт Observable, который эмитит значение после заданной задержки.

```typescript
import { timer } from 'rxjs';

// Эмитит 0 через 1 секунду, затем каждую секунду
const interval$ = timer(1000, 1000);

// Эмитит 0 через 1 секунду и завершается
const delay$ = timer(1000);

// Эмитит сразу, затем каждую секунду
const immediate$ = timer(0, 1000);

// Эмитит в определённое время
const scheduled$ = timer(new Date('2024-12-31 23:59:59'));
```

**Когда использовать:**
- Задержка выполнения
- Периодические операции
- Мониторинг expiration времени
- Debounce/throttle логика

---

### `interval`

Создаёт Observable, который периодически эмитит возрастающие числа.

```typescript
import { interval } from 'rxjs';

// Каждую секунду: 0, 1, 2, 3...
const second$ = interval(1000);

// Polling каждые 5 секунд
const polling$ = interval(5000).pipe(
  switchMap(() => fetchData())
);
```

**Когда использовать:**
- Polling
- Периодические проверки
- Heartbeat

---

### `defer`

Ленивое создание Observable - создаёт новый при каждой подписке.

```typescript
import { defer } from 'rxjs';

// Создаёт новый Observable при каждой подписке
const deferred$ = defer(() => {
  console.log('Creating observable');
  return of(Date.now());
});

// Каждый subscriber получит своё время
deferred$.subscribe(console.log); // 1703123456789
deferred$.subscribe(console.log); // 1703123456800

// Полезно для retry логики
const retryable$ = defer(() => createConnection()).pipe(
  retry(3)
);
```

**Когда использовать:**
- Ленивая инициализация
- Уникальное выполнение для каждого subscriber
- Retry логика для подключений

---

### `throwError`

Создаёт Observable, который сразу эмитит ошибку.

```typescript
import { throwError } from 'rxjs';

// Простая ошибка
const error$ = throwError(() => new Error('Something went wrong'));

// В условной логике
const conditional$ = condition 
  ? validStream$ 
  : throwError(() => new Error('Invalid condition'));

// С обработкой
source$.pipe(
  switchMap(value => {
    if (!isValid(value)) {
      return throwError(() => new Error('Invalid value'));
    }
    return process(value);
  }),
  catchError(error => {
    console.error(error);
    return of(fallbackValue);
  })
);
```

---

### `NEVER`

Observable, который никогда ничего не эмитит и не завершается.

```typescript
import { NEVER } from 'rxjs';

// Полное отключение потока
const controlled$ = toggle$.pipe(
  switchMap(isActive => isActive ? dataStream$ : NEVER)
);
```

**Когда использовать:**
- Полное отключение потока
- Placeholder в switchMap
- Некромант-паттерн

---

## Transformation Operators

### `map`

Трансформирует каждое значение, применяя функцию.

```typescript
import { map } from 'rxjs/operators';

// Простая трансформация
numbers$.pipe(
  map(x => x * 2)
);

// Извлечение поля
users$.pipe(
  map(user => user.name)
);

// Преобразование структуры
api$.pipe(
  map(response => ({
    id: response.data.id,
    name: response.data.attributes.name
  }))
);
```

**Правила:**
- Функция должна быть чистой (pure function)
- Не изменяй входное значение
- Возвращай новый объект при трансформации

---

### `switchMap`

Переключается на новый Observable, **отменяя предыдущий**.

```typescript
import { switchMap } from 'rxjs/operators';

// HTTP запрос - отменяет предыдущий
searchInput$.pipe(
  debounceTime(300),
  switchMap(query => http.get(`/api/search?q=${query}`))
);

// Навигация - отменяет предыдущий route load
route$.pipe(
  switchMap(params => loadData(params.id))
);

// WebSocket - переподключение
connect$.pipe(
  switchMap(() => createWebSocket())
);
```

**Когда использовать:**
- HTTP запросы (отмена старых)
- Search/autocomplete
- Navigation
- Переключение между потоками

**Не использовать для:**
- POST/PUT/DELETE запросов (потеря данных)
- Операций, которые должны завершиться

---

### `mergeMap` (flatMap)

Подписывается на все Observable параллельно, не отменяя предыдущие.

```typescript
import { mergeMap } from 'rxjs/operators';

// Параллельные запросы
ids$.pipe(
  mergeMap(id => http.get(`/api/items/${id}`))
);

// Множественные операции
files$.pipe(
  mergeMap(file => uploadFile(file), 3) // max 3 concurrent
);
```

**Когда использовать:**
- Параллельные операции
- Множественные независимые запросы
- Fire-and-forget операции

---

### `exhaustMap`

Игнорирует новые значения, пока текущий Observable не завершится.

```typescript
import { exhaustMap } from 'rxjs/operators';

// Игнорирует клики пока запрос выполняется
saveButton$.pipe(
  exhaustMap(() => http.post('/api/save', data))
);

// Защита от spam
loginAttempts$.pipe(
  exhaustMap(credentials => authenticate(credentials))
);
```

**Когда использовать:**
- Защита от double-click
- Login/submit кнопки
- Операции, которые не должны прерываться

---

### `concatMap`

Выполняет Observable последовательно, ожидая завершения предыдущего.

```typescript
import { concatMap } from 'rxjs/operators';

// Последовательные операции
tasks$.pipe(
  concatMap(task => executeTask(task))
);

// Гарантия порядка
updates$.pipe(
  concatMap(update => saveToServer(update))
);
```

**Когда использовать:**
- Важен порядок выполнения
- Операции должны выполняться последовательно
- Queue processing

---

## Filtering Operators

### `filter`

Пропускает только значения, соответствующие предикату.

```typescript
import { filter } from 'rxjs/operators';

// Простой предикат
numbers$.pipe(
  filter(x => x > 10)
);

// Type guard
values$.pipe(
  filter((x): x is NonNullable<T> => x != null)
);

// Проверка поля
users$.pipe(
  filter(user => user.isActive && user.role === 'admin')
);
```

**Best practice:** Используй type guard для type narrowing

---

### `takeUntil`

Эмитит значения до тех пор, пока notifier не эмитит.

```typescript
import { takeUntil } from 'rxjs/operators';

// Классический паттерн отписки
#destroy$ = new Subject<void>();

ngOnInit() {
  source$.pipe(
    takeUntil(this.#destroy$)
  ).subscribe();
}

ngOnDestroy() {
  this.#destroy$.next();
  this.#destroy$.complete();
}

// Условная остановка
data$.pipe(
  takeUntil(stopSignal$)
);

// Timeout
operation$.pipe(
  takeUntil(timer(5000)) // max 5 seconds
);
```

**Когда использовать:**
- Отписка в компонентах
- Timeout логика
- Некромант-паттерн

---

### `take`

Эмитит только первые N значений.

```typescript
import { take } from 'rxjs/operators';

// Первое значение
source$.pipe(take(1));

// Первые 5
source$.pipe(take(5));

// One-time operation
interval(1000).pipe(
  take(1),
  map(() => Date.now())
);
```

---

### `first`

Эмитит первое значение (или первое, соответствующее условию) и завершается.

```typescript
import { first } from 'rxjs/operators';

// Просто первое
source$.pipe(first());

// Первое с условием
source$.pipe(
  first(x => x > 10)
);

// С fallback
source$.pipe(
  first(x => x.isReady, defaultValue)
);

// Ошибка если пусто
source$.pipe(
  first()
); // Throws EmptyError if completes without emitting
```

---

### `distinctUntilChanged`

Эмитит только если значение изменилось относительно предыдущего.

```typescript
import { distinctUntilChanged } from 'rxjs/operators';

// Примитивы
numbers$.pipe(
  distinctUntilChanged()
);

// С компаратором
objects$.pipe(
  distinctUntilChanged((prev, curr) => 
    prev.id === curr.id
  )
);

// С key selector
users$.pipe(
  distinctUntilChanged((prev, curr) => 
    prev.lastModified === curr.lastModified
  )
);
```

---

### `debounceTime`

Эмитит значение только после тишины в течение указанного времени.

```typescript
import { debounceTime } from 'rxjs/operators';

// Search input
searchInput$.pipe(
  debounceTime(300),
  switchMap(query => search(query))
);

// Window resize
fromEvent(window, 'resize').pipe(
  debounceTime(200),
  map(() => window.innerWidth)
);
```

---

### `throttleTime`

Эмитит значение, затем игнорирует последующие в течение указанного времени.

```typescript
import { throttleTime } from 'rxjs/operators';

// Clicks
clicks$.pipe(
  throttleTime(1000) // max 1 per second
);

// Scroll
scroll$.pipe(
  throttleTime(100)
);
```

**Разница с debounce:**
- `debounce`: ждёт тишины, затем эмитит
- `throttle`: эмитит первое, затем блокирует на время

---

## Combination Operators

### `merge`

Объединяет несколько Observable в один поток.

```typescript
import { merge } from 'rxjs';

// Объединение источников
const combined$ = merge(
  clicks$,
  keypress$,
  touch$
);

// С приоритетом (первый эмитит первым)
const events$ = merge(
  urgent$,
  normal$,
  low$
);

// Ограничение concurrent
merge(
  ...requests,
  3 // max 3 concurrent
);
```

---

### `mergeWith`

Instance operator версия merge.

```typescript
import { mergeWith } from 'rxjs/operators';

source$.pipe(
  mergeWith(other1$, other2$, other3$)
);

// Паттерн reset
state$.pipe(
  mergeWith(reset$.pipe(map(() => initialState)))
);
```

---

### `combineLatest`

Эмитит массив последних значений всех Observable при изменении любого из них.

```typescript
import { combineLatest } from 'rxjs';

// Комбинирование форм
const form$ = combineLatest([
  firstName$,
  lastName$,
  email$
]).pipe(
  map(([first, last, email]) => ({ first, last, email }))
);

// Ждёт первого значения от ВСЕХ
const ready$ = combineLatest([
  authReady$,
  configLoaded$,
  dataFetched$
]);
```

**Важно:** Не эмитит пока все источники не эмитнут хотя бы раз.

---

### `combineLatestWith`

Instance operator версия combineLatest.

```typescript
import { combineLatestWith } from 'rxjs/operators';

user$.pipe(
  combineLatestWith(permissions$, settings$),
  map(([user, perms, settings]) => ({
    user,
    canEdit: perms.includes('edit'),
    theme: settings.theme
  }))
);
```

---

### `withLatestFrom`

Комбинирует значение источника с последними значениями других, но эмитит только при эмиссии источника.

```typescript
import { withLatestFrom } from 'rxjs/operators';

// Эмитит только когда clicks$ эмитит
clicks$.pipe(
  withLatestFrom(user$, settings$),
  map(([click, user, settings]) => ({
    clickX: click.x,
    userId: user.id,
    theme: settings.theme
  }))
);
```

**Разница с combineLatest:**
- `combineLatest`: эмитит при изменении ЛЮБОГО
- `withLatestFrom`: эмитит только при изменении ИСТОЧНИКА

---

### `forkJoin`

Ждёт завершения всех Observable, затем эмитит массив последних значений.

```typescript
import { forkJoin } from 'rxjs';

// Параллельные запросы, ждём все
const all$ = forkJoin({
  user: http.get('/api/user'),
  posts: http.get('/api/posts'),
  comments: http.get('/api/comments')
});

// Массив
const results$ = forkJoin([
  request1$,
  request2$,
  request3$
]);
```

**Аналог:** `Promise.all()`

**Важно:** Если хоть один завершится с ошибкой - весь forkJoin упадёт.

---

### `zip`

Комбинирует значения по позиции (первое с первым, второе со вторым).

```typescript
import { zip } from 'rxjs';

// Парные значения
const pairs$ = zip(
  interval(100), // 0, 1, 2, 3...
  interval(200)  // 0, 1, 2, 3...
); // [0,0], [1,1], [2,2]...

// Request/Response паттерн
const requestResponse$ = zip(
  requests$,
  responses$
);
```

---

### `raceWith`

Возвращает первый Observable, который эмитит.

```typescript
import { raceWith } from 'rxjs/operators';

// Гонка между success и error
resolved$.pipe(
  raceWith(error$) // Побеждает тот, кто эмитит первым
);

// Timeout fallback
dataStream$.pipe(
  raceWith(
    timer(5000).pipe(map(() => 'timeout'))
  )
);

// Multiple sources - fastest wins
primary$.pipe(
  raceWith(backup1$, backup2$)
);
```

---

## Error Handling

### `catchError`

Обрабатывает ошибку и возвращает новый Observable или пробрасывает ошибку дальше.

```typescript
import { catchError, throwError } from 'rxjs';

// Fallback значение
http.get('/api/data').pipe(
  catchError(() => of(defaultData))
);

// Retry с другим источником
primary$.pipe(
  catchError(() => backup$)
);

// Обработка и проброс
source$.pipe(
  catchError(error => {
    console.error('Error:', error);
    toast.error('Operation failed');
    return throwError(() => error);
  })
);

// Conditional recovery
source$.pipe(
  catchError(error => {
    if (error.status === 404) {
      return of(null);
    }
    return throwError(() => error);
  })
);
```

---

### `retry`

Повторяет Observable при ошибке.

```typescript
import { retry, timer } from 'rxjs';

// Простой retry
http.get('/api/data').pipe(
  retry(3)
);

// С конфигурацией
http.get('/api/data').pipe(
  retry({
    count: 3,
    delay: 1000
  })
);

// Exponential backoff
http.get('/api/data').pipe(
  retry({
    count: 5,
    delay: (error, retryCount) => {
      console.log(`Retry ${retryCount} after error:`, error);
      return timer(Math.pow(2, retryCount) * 1000);
    }
  })
);

// Conditional retry
source$.pipe(
  retry({
    count: 3,
    delay: (error) => {
      if (error.status >= 500) {
        return timer(2000);
      }
      return throwError(() => error);
    }
  })
);
```

---

### `repeat`

Повторяет Observable после успешного завершения.

```typescript
import { repeat } from 'rxjs';

// Бесконечное повторение
source$.pipe(
  repeat()
);

// N раз
source$.pipe(
  repeat(3) // выполнится 4 раза (1 + 3 повтора)
);

// С задержкой
source$.pipe(
  repeat({ delay: 1000 })
);

// С условием (некромант-паттерн)
source$.pipe(
  takeUntil(stop$),
  repeat({ delay: () => start$ })
);
```

---

## Utility Operators

### `tap`

Выполняет side effect без изменения потока.

```typescript
import { tap } from 'rxjs/operators';

// Логирование
source$.pipe(
  tap(value => console.log('Value:', value)),
  map(x => x * 2)
);

// Множественные side effects
source$.pipe(
  tap({
    next: value => console.log('Next:', value),
    error: error => console.error('Error:', error),
    complete: () => console.log('Complete')
  })
);

// Мутация (осторожно!)
objects$.pipe(
  tap(obj => obj.processed = true) // Лучше использовать map
);
```

**Best practice:** Не изменяй значения в tap, используй map.

---

### `delay`

Задерживает эмиссию значений на указанное время.

```typescript
import { delay } from 'rxjs/operators';

// Фиксированная задержка
source$.pipe(
  delay(1000)
);

// Задержка до определённого времени
source$.pipe(
  delay(new Date('2024-12-31'))
);
```

---

### `timeout`

Выбрасывает ошибку если Observable не эмитит в течение указанного времени.

```typescript
import { timeout, catchError } from 'rxjs/operators';

// Простой timeout
http.get('/api/data').pipe(
  timeout(5000),
  catchError(() => of('timeout'))
);

// С конфигурацией
source$.pipe(
  timeout({
    each: 1000, // timeout между эмиссиями
    with: () => of('timeout value')
  })
);
```

---

### `finalize`

Выполняется при завершении Observable (успешном или с ошибкой).

```typescript
import { finalize } from 'rxjs/operators';

// Cleanup
http.post('/api/data', data).pipe(
  finalize(() => {
    loading.set(false);
    console.log('Request finished');
  })
);
```

---

### `shareReplay`

Делает cold Observable hot и кэширует последние N значений.

```typescript
import { shareReplay } from 'rxjs/operators';

// Кэширует последнее значение
const config$ = http.get('/api/config').pipe(
  shareReplay(1)
);

// Множественные подписки = один запрос
config$.subscribe(console.log);
config$.subscribe(console.log);

// С настройками
const shared$ = expensive$.pipe(
  shareReplay({
    bufferSize: 1,
    refCount: true // отписка когда нет subscribers
  })
);
```

---

## Multicasting

### `connect`

Создаёт multicast Observable с полным контролем.

```typescript
import { connect, ReplaySubject } from 'rxjs/operators';

// Кастомный multicast
source$.pipe(
  connect(shared => 
    merge(
      shared.pipe(filter(x => x > 0)),
      shared.pipe(filter(x => x <= 0))
    ),
    {
      connector: () => new ReplaySubject(1)
    }
  )
);
```

---

## Scheduler Reference

### `asyncScheduler`

Планирует работу через `setInterval`/`setTimeout`.

```typescript
import { asyncScheduler, observeOn } from 'rxjs';

source$.pipe(
  observeOn(asyncScheduler)
);
```

---

### `asapScheduler`

Планирует работу в microtask queue (Promise.resolve).

```typescript
import { asapScheduler } from 'rxjs';

// Быстрее чем async
source$.pipe(
  observeOn(asapScheduler)
);
```

---

## Performance Tips

1. **Используйте shareReplay для дорогих операций**
2. **Предпочитайте switchMap для user-triggered операций**
3. **Используйте mergeMap с concurrency limit для параллельных операций**
4. **Всегда добавляйте takeUntil для управления памятью**
5. **Используйте async pipe в шаблонах вместо subscribe**

---

## Debugging

```typescript
// Логирование всех событий
source$.pipe(
  tap({
    next: v => console.log('Next:', v),
    error: e => console.error('Error:', e),
    complete: () => console.log('Complete'),
    subscribe: () => console.log('Subscribed'),
    unsubscribe: () => console.log('Unsubscribed')
  })
);

// Breakpoint в потоке
source$.pipe(
  tap(v => debugger),
  map(...)
);
```

---

**Version:** RxJS 7.8.2  
**Project:** Rabbithole (Nx Monorepo)  
**Last Updated:** 2024