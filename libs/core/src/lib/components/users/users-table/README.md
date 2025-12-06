# Users Table Component

Компонент таблицы пользователей с поддержкой асинхронной загрузки, серверной пагинации, фильтрации и сортировки. Построен на базе [Tanstack Table](https://tanstack.com/table/latest/docs/framework/angular/overview) и UI-компонентов Spartan NG, ориентирован на внешний источник данных (сервер) и полностью управляемое состояние.

## Особенности

- **Серверная пагинация** — поддержка внешнего управления страницами и размером страницы, быстрый переход между страницами.
- **Фильтрация** — фильтрация по имени пользователя, а также гибкие фильтры по диапазону дат (создания и обновления).
- **Сортировка** — сортировка по датам и (при необходимости) другим полям, с управлением направления сортировки.
- **Управляемая видимость колонок** — возможность скрывать и показывать отдельные колонки.
- **Загрузка и индикатор** — обработка состояния загрузки данных.
- **Адаптивный дизайн** — корректная работа на любых устройствах.
- **Полная типизация TypeScript** — строгие типы данных.
- **Интеграция с сервисом** — для работы с серверными данными через UsersTableService.

## Использование

### Быстрый старт

```typescript
import { UsersTableComponent } from '@rabbithole/core';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [UsersTableComponent],
  template: '<core-users-table [data]="users" [totalCount]="totalCount" [loading]="isLoading" (pageChange)="onPage($event)" />'
})
export class UsersComponent {
  users = [];
  totalCount = 0;
  isLoading = false;

  // реализуйте обработку pageChange для подгрузки данных с сервера
  onPage(event: { pageIndex: number, pageSize: number }) { /* ... */ }
}
```

### С сервисом для работы с сервером

```typescript
import { UsersTableComponent, UsersTableService } from '@rabbithole/core';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [UsersTableComponent],
  providers: [UsersTableService],
  template: `
    <core-users-table
      [data]="state().data"
      [totalCount]="state().totalCount"
      [loading]="state().loading"
      (pageChange)="onPage($event)"
    />
  `
})
export class UsersComponent {
  usersService = inject(UsersTableService);
  state = this.usersService.state;

  ngOnInit() {
    // Первый запрос профилей
    this.usersService.loadProfiles(actor);
  }

  onPage(event: { pageIndex: number, pageSize: number }) {
    this.usersService.setPageIndex(event.pageIndex);
    this.usersService.setPageSize(event.pageSize);
    this.usersService.loadProfiles(actor);
  }
}
```

## API

### UsersTableComponent

#### Inputs

- `data: Profile[]` — массив пользователей для отображения.
- `totalCount: number` — общее количество пользователей (для серверной пагинации).
- `loading: boolean` — признак загрузки данных на текущей странице.

#### Outputs

- `pageChange: { pageIndex: number; pageSize: number }` — событие запроса новой страницы/размера страницы. Необходим для реализации серверной пагинации; компонент не хранит внутреннего состояния пагинации.

### UsersTableService

#### Методы

- `loadProfiles(actor: RabbitholeActorService)` — загрузка и обновление списка пользователей с сервера по заданным фильтрам.
- `setSearch(search: string)` — установка поискового запроса (фильтр по имени).
- `setDateFilter(filter: DateFilter | null)` — ограничение по дате (от и до).
- `setPageSize(size: number)` — изменить размер страницы (сбросит текущую страницу на 0).
- `setPageIndex(index: number)` — изменить текущую страницу.
- `setSorting(field: string, direction: 'asc' | 'desc')` — сортировка по полю.

#### Утилиты для быстрой работы с датами

- `setLastDaysFilter(days: number)` — выставить фильтр по последним N дням.
- `setCurrentMonthFilter()` — отфильтровать текущий месяц.
- `clearDateFilter()` — снять фильтр по датам.

#### Получение состояния

```typescript
usersService.state(); // { data, totalCount, loading, error }
```

## Структура данных

### Profile

```typescript
export interface Profile {
  id: string;             // Principal ID пользователя
  username: string;       // Имя пользователя
  displayName?: string;   // Отображаемое имя
  avatarUrl?: string;     // URL аватара
  createdAt: Date;        // Дата создания
  updatedAt: Date;        // Дата обновления
  inviter?: string;       // ID пригласившего пользователя (опционально)
}
```

### DateFilter

```typescript
export interface DateFilter {
  min?: Date; // дата "от"
  max?: Date; // дата "до"
}
```

## Описание работы и интерфейса

- **User** — отображает аватар пользователя, username, displayName (если есть) и id.
- **Created at** — дата создания профиля (всегда отображается).
- **Updated at** — дата последнего обновления (скрыта по умолчанию, может быть показана).

## Фильтрация и поиск

- Поиск работает по username (и возможно, расширяется).
- Фильтр по датам: последние 7/30 дней, текущий месяц, произвольные диапазоны.
- В любой момент фильтр по датам может быть сброшен (`clearDateFilter`).

## Пагинация

- Доступные размеры страницы: 5, 10, 20, 50, 100.
- Серверная пагинация: компонент не хранит внутреннее состояние, полностью управляется родителем.
- Стандартные элементы управления страницей: переход "назад/вперед", отображение количества записей.

## Управление колонками

- Возможность показать/скрыть колонку "Updated at".
- Остальные колонки (User, Created at) всегда отображаются.

## Зависимости

- [`@tanstack/angular-table`](https://tanstack.com/table/latest/docs/framework/angular/overview) — управление таблицей и состоянием.
- [`@spartan-ng/helm`](https://spartan-ng.dev/) — UI-компоненты.
- [`@ng-icons/lucide`](https://ng-icons.lane.dev/) — иконки.
- [`@dfinity/utils`](https://www.npmjs.com/package/@dfinity/utils), [`date-fns`](https://date-fns.org/) — преобразования и фильтрация дат.

---

> ℹ️ Компонент спроектирован для серверного рендеринга больших таблиц c возможностью поиска и гибкой фильтрации по датам. Не хранит состояние страниц — интегрируйте с собственными сервисами.
