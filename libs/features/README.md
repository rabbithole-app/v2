# features

Библиотека с фичами приложения. Каждая фича загружается отдельным чанком для оптимизации bundle size.

## Структура

Каждая фича находится в `src/lib/<feature-name>/` и экспортируется как secondary entry point:
- `@rabbithole/features/file-list` - фича списка файлов
- `@rabbithole/features/canisters` - фича управления канстерами

## Использование в роутинге

Каждая фича загружается отдельным чанком через lazy loading:

```typescript
import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: 'canisters',
    loadChildren: () =>
      import('@rabbithole/features/canisters').then((m) => m.canistersRoutes),
  },
  {
    path: 'files',
    loadChildren: () =>
      import('@rabbithole/features/file-list').then((m) => m.fileListRoutes),
  },
];
```

Или для standalone компонентов:

```typescript
{
  path: 'canisters',
  loadComponent: () =>
    import('@rabbithole/features/canisters').then(
      (m) => m.CanistersComponent
    ),
}
```

## Добавление новой фичи

1. Создайте папку `src/lib/<feature-name>/`
2. Создайте `index.ts` с экспортами
3. Создайте `routes.ts` с роутами фичи
4. Добавьте путь в `tsconfig.base.json`:
   ```json
   "@rabbithole/features/<feature-name>": ["libs/features/src/lib/<feature-name>/index.ts"]
   ```
5. Экспортируйте фичу в `src/index.ts`

## Running unit tests

Run `nx test features` to execute the unit tests.
