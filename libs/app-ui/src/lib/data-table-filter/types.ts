/* eslint-disable perfectionist/sort-interfaces, perfectionist/sort-modules, perfectionist/sort-union-types */

export type RbthFilterColumnType =
  | 'boolean'
  | 'custom'
  | 'date'
  | 'multiOption'
  | 'number'
  | 'option'
  | 'principal'
  | 'text';

export interface RbthFilterOption {
  label: string;
  value: string;
  count?: number;
  colorClass?: string;
  iconName?: string;
}

export type RbthFilterStrategy = 'client' | 'server';

export type RbthBooleanFilterOperator = 'is' | 'isNot';
export type RbthCustomFilterOperator = 'is' | 'isAnyOf' | 'isNoneOf' | 'isNot';

export type RbthTextFilterOperator = 'contains' | 'doesNotContain';

export type RbthNumberFilterOperator =
  | 'equals'
  | 'notEquals'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'between'
  | 'notBetween';

export type RbthDateFilterOperator =
  | 'on'
  | 'notOn'
  | 'before'
  | 'onOrBefore'
  | 'after'
  | 'onOrAfter'
  | 'between'
  | 'notBetween';

export type RbthOptionFilterOperator = 'is' | 'isAnyOf' | 'isNoneOf' | 'isNot';

export type RbthPrincipalFilterOperator =
  | 'is'
  | 'isAnyOf'
  | 'isNoneOf'
  | 'isNot';

export type RbthMultiOptionFilterOperator =
  | 'exclude'
  | 'excludeIfAll'
  | 'excludeIfAnyOf'
  | 'include'
  | 'includeAllOf'
  | 'includeAnyOf';

export interface RbthTextFilterModel {
  columnId: string;
  operator: RbthTextFilterOperator;
  type: 'text';
  values: string[];
}

export interface RbthNumberFilterModel {
  columnId: string;
  operator: RbthNumberFilterOperator;
  type: 'number';
  values: number[];
}

export interface RbthDateFilterModel {
  columnId: string;
  operator: RbthDateFilterOperator;
  type: 'date';
  values: Date[];
}

export interface RbthOptionFilterModel {
  columnId: string;
  operator: RbthOptionFilterOperator;
  type: 'option';
  values: string[];
}

export interface RbthPrincipalFilterModel {
  columnId: string;
  operator: RbthPrincipalFilterOperator;
  type: 'principal';
  values: string[];
}

export interface RbthMultiOptionFilterModel {
  columnId: string;
  operator: RbthMultiOptionFilterOperator;
  type: 'multiOption';
  values: string[];
}

export interface RbthBooleanFilterModel {
  columnId: string;
  operator: RbthBooleanFilterOperator;
  type: 'boolean';
  values: boolean[];
}

export interface RbthCustomFilterModel {
  columnId: string;
  operator: RbthCustomFilterOperator;
  type: 'custom';
  values: unknown[];
}

export type RbthFilterModel =
  | RbthBooleanFilterModel
  | RbthCustomFilterModel
  | RbthDateFilterModel
  | RbthMultiOptionFilterModel
  | RbthNumberFilterModel
  | RbthOptionFilterModel
  | RbthPrincipalFilterModel
  | RbthTextFilterModel;

export type RbthFiltersState = RbthFilterModel[];

export type RbthFilterOperator =
  | RbthBooleanFilterOperator
  | RbthCustomFilterOperator
  | RbthDateFilterOperator
  | RbthMultiOptionFilterOperator
  | RbthNumberFilterOperator
  | RbthOptionFilterOperator
  | RbthPrincipalFilterOperator
  | RbthTextFilterOperator;

export type RbthFilterOperatorMap = {
  boolean: RbthBooleanFilterOperator;
  custom: RbthCustomFilterOperator;
  date: RbthDateFilterOperator;
  multiOption: RbthMultiOptionFilterOperator;
  number: RbthNumberFilterOperator;
  option: RbthOptionFilterOperator;
  principal: RbthPrincipalFilterOperator;
  text: RbthTextFilterOperator;
};

interface RbthFilterColumnBase<TType extends RbthFilterColumnType> {
  iconName?: string;
  id: string;
  label: string;
  operators?: ReadonlyArray<RbthFilterOperatorMap[TType]>;
  type: TType;
}

export interface RbthBooleanFilterColumn<
  TData,
> extends RbthFilterColumnBase<'boolean'> {
  accessor?: (row: TData) => boolean | null | undefined;
  falseLabel?: string;
  trueLabel?: string;
}

export interface RbthCustomFilterColumn<TData> extends Omit<
  RbthFilterColumnBase<'custom'>,
  'operators'
> {
  accessor?: (row: TData) => unknown;
  operators: ReadonlyArray<RbthCustomFilterOperator>;
}

export interface RbthTextFilterColumn<
  TData,
> extends RbthFilterColumnBase<'text'> {
  accessor?: (row: TData) => string | null | undefined;
}

export interface RbthNumberFilterColumn<
  TData,
> extends RbthFilterColumnBase<'number'> {
  accessor?: (row: TData) => number | null | undefined;
  max?: number;
  min?: number;
}

export interface RbthDateFilterColumn<
  TData,
> extends RbthFilterColumnBase<'date'> {
  accessor?: (row: TData) => Date | null | undefined;
}

export interface RbthOptionFilterColumn<
  TData,
> extends RbthFilterColumnBase<'option'> {
  accessor?: (row: TData) => string | null | undefined;
  options?: RbthFilterOption[];
}

export interface RbthPrincipalFilterColumn<
  TData,
> extends RbthFilterColumnBase<'principal'> {
  accessor?: (row: TData) => string | null | undefined;
}

export interface RbthMultiOptionFilterColumn<
  TData,
> extends RbthFilterColumnBase<'multiOption'> {
  accessor?: (row: TData) => string[] | null | undefined;
  options?: RbthFilterOption[];
}

export type RbthFilterColumn<TData = never> =
  | RbthBooleanFilterColumn<TData>
  | RbthCustomFilterColumn<TData>
  | RbthDateFilterColumn<TData>
  | RbthMultiOptionFilterColumn<TData>
  | RbthNumberFilterColumn<TData>
  | RbthOptionFilterColumn<TData>
  | RbthPrincipalFilterColumn<TData>
  | RbthTextFilterColumn<TData>;

export type RbthAnyFilterColumn<TData = never> = RbthFilterColumn<TData>;

export interface RbthFilterOperatorOption<
  TOperator extends RbthFilterOperator = RbthFilterOperator,
> {
  label: string;
  target: 'multiple' | 'single';
  value: TOperator;
}
