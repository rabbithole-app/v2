/* eslint-disable perfectionist/sort-modules */

import { endOfDay, isSameDay, startOfDay } from 'date-fns';

import {
  RbthBooleanFilterModel,
  RbthDateFilterModel,
  RbthFilterColumn,
  RbthFilterColumnType,
  RbthFilterModel,
  RbthFiltersState,
  RbthMultiOptionFilterModel,
  RbthNumberFilterModel,
  RbthOptionFilterModel,
  RbthPrincipalFilterModel,
  RbthTextFilterModel,
} from './types';

function hasIntersection(left: string[], right: string[]): boolean {
  return left.some((value) => right.includes(value));
}

export function rbthBooleanFilterFn(
  input: boolean | null | undefined,
  filter: RbthBooleanFilterModel,
): boolean {
  if (typeof input !== 'boolean') return false;
  if (!filter.values.length) return true;

  const found = input === filter.values[0];
  return filter.operator === 'is' ? found : !found;
}

export function rbthTextFilterFn(
  input: string | null | undefined,
  filter: RbthTextFilterModel,
): boolean {
  const needle = filter.values[0]?.trim().toLowerCase();
  if (!needle) return true;

  const value = String(input ?? '').trim().toLowerCase();
  const found = value.includes(needle);
  return filter.operator === 'contains' ? found : !found;
}

export function rbthNumberFilterFn(
  input: number | null | undefined,
  filter: RbthNumberFilterModel,
): boolean {
  if (typeof input !== 'number' || Number.isNaN(input)) return false;
  if (!filter.values.length) return true;

  const [first, second] = filter.values;
  switch (filter.operator) {
    case 'between':
      return second === undefined ? true : input >= first && input <= second;
    case 'equals':
      return input === first;
    case 'greaterThan':
      return input > first;
    case 'greaterThanOrEqual':
      return input >= first;
    case 'lessThan':
      return input < first;
    case 'lessThanOrEqual':
      return input <= first;
    case 'notBetween':
      return second === undefined ? true : input < first || input > second;
    case 'notEquals':
      return input !== first;
  }
}

export function rbthDateFilterFn(
  input: Date | null | undefined,
  filter: RbthDateFilterModel,
): boolean {
  if (!(input instanceof Date) || Number.isNaN(input.getTime())) return false;
  if (!filter.values.length) return true;

  const [first, second] = filter.values;
  switch (filter.operator) {
    case 'after':
      return input > startOfDay(first);
    case 'before':
      return input < startOfDay(first);
    case 'between':
      return second === undefined
        ? true
        : input >= startOfDay(first) && input <= endOfDay(second);
    case 'notBetween':
      return second === undefined
        ? true
        : input < startOfDay(first) || input > endOfDay(second);
    case 'notOn':
      return !isSameDay(input, first);
    case 'on':
      return isSameDay(input, first);
    case 'onOrAfter':
      return isSameDay(input, first) || input > startOfDay(first);
    case 'onOrBefore':
      return isSameDay(input, first) || input < startOfDay(first);
  }
}

export function rbthOptionFilterFn(
  input: string | null | undefined,
  filter: RbthOptionFilterModel,
): boolean {
  if (!filter.values.length) return true;

  const value = String(input ?? '').toLowerCase();
  const found = filter.values.some((item) => item.toLowerCase() === value);
  switch (filter.operator) {
    case 'is':
    case 'isAnyOf':
      return found;
    case 'isNoneOf':
    case 'isNot':
      return !found;
  }
}

export function rbthPrincipalFilterFn(
  input: string | null | undefined,
  filter: RbthPrincipalFilterModel,
): boolean {
  if (!filter.values.length) return true;

  const value = String(input ?? '');
  const found = filter.values.some((item) => item === value);
  switch (filter.operator) {
    case 'is':
    case 'isAnyOf':
      return found;
    case 'isNoneOf':
    case 'isNot':
      return !found;
  }
}

export function rbthMultiOptionFilterFn(
  input: string[] | null | undefined,
  filter: RbthMultiOptionFilterModel,
): boolean {
  if (!filter.values.length) return true;
  if (!Array.isArray(input)) return false;

  const values = input.map((value) => String(value));
  const filterValues = filter.values.map((value) => String(value));
  const intersection = filterValues.filter((value) => values.includes(value));

  switch (filter.operator) {
    case 'exclude':
    case 'excludeIfAnyOf':
      return !hasIntersection(values, filterValues);
    case 'excludeIfAll':
      return intersection.length !== filterValues.length;
    case 'include':
    case 'includeAnyOf':
      return hasIntersection(values, filterValues);
    case 'includeAllOf':
      return intersection.length === filterValues.length;
  }
}

export function rbthFilterRow<TData>(
  row: TData,
  columns: ReadonlyArray<RbthFilterColumn<TData>>,
  filters: RbthFiltersState,
): boolean {
  return filters.every((filter) => {
    const column = columns.find((item) => item.id === filter.columnId);
    if (!column?.accessor || column.type !== filter.type) return true;

    const value = column.accessor(row);
    return rbthFilterUnknownValue(value, filter);
  });
}

export function rbthFilterUnknownValue(
  value: unknown,
  filter: RbthFilterModel,
): boolean {
  switch (filter.type) {
    case 'boolean':
      return typeof value === 'boolean' && rbthBooleanFilterFn(value, filter);
    case 'custom':
      return true;
    case 'date':
      return value instanceof Date && rbthDateFilterFn(value, filter);
    case 'multiOption':
      return (
        Array.isArray(value) &&
        value.every((item) => typeof item === 'string') &&
        rbthMultiOptionFilterFn(value, filter)
      );
    case 'number':
      return typeof value === 'number' && rbthNumberFilterFn(value, filter);
    case 'option':
      return typeof value === 'string' && rbthOptionFilterFn(value, filter);
    case 'principal':
      return typeof value === 'string' && rbthPrincipalFilterFn(value, filter);
    case 'text':
      return typeof value === 'string' && rbthTextFilterFn(value, filter);
  }
}

export function rbthApplyFilters<TData>(
  rows: TData[],
  columns: ReadonlyArray<RbthFilterColumn<TData>>,
  filters: RbthFiltersState,
): TData[] {
  if (!filters.length) return rows;
  return rows.filter((row) => rbthFilterRow(row, columns, filters));
}

export function rbthColumnAcceptsFilter(
  type: RbthFilterColumnType,
  filter: RbthFilterModel,
): boolean {
  return type === filter.type;
}
