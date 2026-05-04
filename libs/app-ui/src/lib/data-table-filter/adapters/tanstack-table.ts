/* eslint-disable perfectionist/sort-modules */

import {
  ColumnDef,
  ColumnFiltersState,
  FilterFn,
} from '@tanstack/angular-table';

import {
  rbthFilterUnknownValue,
} from '../filter-fns';
import {
  RbthAnyFilterColumn,
  RbthFilterColumn,
  RbthFilterModel,
  RbthFiltersState,
} from '../types';

function isRbthFilterModel(value: unknown): value is RbthFilterModel {
  if (typeof value !== 'object' || value === null) return false;
  if (
    !('columnId' in value) ||
    !('operator' in value) ||
    !('type' in value) ||
    !('values' in value)
  ) {
    return false;
  }

  return (
    typeof value.columnId === 'string' &&
    typeof value.operator === 'string' &&
    typeof value.type === 'string' &&
    Array.isArray(value.values) &&
    [
      'boolean',
      'custom',
      'date',
      'multiOption',
      'number',
      'option',
      'principal',
      'text',
    ].includes(value.type)
  );
}

export function rbthToTanStackFilters(
  filters: RbthFiltersState,
): ColumnFiltersState {
  return filters.map((filter) => ({
    id: filter.columnId,
    value: filter,
  }));
}

export function rbthTanStackFilterFn<TData>(
  columns: ReadonlyArray<RbthFilterColumn<TData>>,
): FilterFn<TData> {
  return (row, columnId, filterValue) => {
    if (!isRbthFilterModel(filterValue) || !filterValue.values.length) {
      return true;
    }

    const config = columns.find((column) => column.id === columnId);
    const value = config?.accessor
      ? config.accessor(row.original)
      : row.getValue(columnId);

    return rbthFilterUnknownValue(value, filterValue);
  };
}

export function rbthWithTanStackFilterFns<TData>(
  columns: ReadonlyArray<ColumnDef<TData>>,
  filterColumns: ReadonlyArray<RbthFilterColumn<TData>>,
): ColumnDef<TData>[] {
  const filterFn = rbthTanStackFilterFn(filterColumns);
  const filterableIds = new Set(filterColumns.map((column) => column.id));

  return columns.map((column) => {
    const id = column.id;
    if (!id || !filterableIds.has(id) || column.enableColumnFilter === false) {
      return column;
    }
    return { ...column, filterFn };
  });
}

export function rbthFiltersToRecord(
  filters: RbthFiltersState,
): Record<string, RbthFilterModel> {
  return Object.fromEntries(
    filters.map((filter) => [filter.columnId, filter]),
  );
}

export function rbthFilterColumnsById<TData>(
  columns: ReadonlyArray<RbthAnyFilterColumn<TData>>,
): Record<string, RbthAnyFilterColumn<TData>> {
  return Object.fromEntries(columns.map((column) => [column.id, column]));
}
