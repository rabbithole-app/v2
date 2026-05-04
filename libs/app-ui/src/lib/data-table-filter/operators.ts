import {
  RbthBooleanFilterOperator,
  RbthCustomFilterOperator,
  RbthDateFilterOperator,
  RbthFilterColumnType,
  RbthFilterOperator,
  RbthFilterOperatorOption,
  RbthMultiOptionFilterOperator,
  RbthNumberFilterOperator,
  RbthOptionFilterOperator,
  RbthPrincipalFilterOperator,
  RbthTextFilterOperator,
} from './types';

export const RBTH_BOOLEAN_FILTER_OPERATORS: RbthFilterOperatorOption<RbthBooleanFilterOperator>[] =
  [
    { label: 'is', target: 'single', value: 'is' },
    { label: 'is not', target: 'single', value: 'isNot' },
  ];

export const RBTH_CUSTOM_FILTER_OPERATORS: RbthFilterOperatorOption<RbthCustomFilterOperator>[] =
  [
    { label: 'is', target: 'single', value: 'is' },
    { label: 'is not', target: 'single', value: 'isNot' },
    { label: 'is any of', target: 'multiple', value: 'isAnyOf' },
    { label: 'is none of', target: 'multiple', value: 'isNoneOf' },
  ];

export const RBTH_DATE_FILTER_OPERATORS: RbthFilterOperatorOption<RbthDateFilterOperator>[] =
  [
    { label: 'is', target: 'single', value: 'on' },
    { label: 'is not', target: 'single', value: 'notOn' },
    { label: 'is before', target: 'single', value: 'before' },
    { label: 'is on or before', target: 'single', value: 'onOrBefore' },
    { label: 'is after', target: 'single', value: 'after' },
    { label: 'is on or after', target: 'single', value: 'onOrAfter' },
    { label: 'is between', target: 'multiple', value: 'between' },
    { label: 'is not between', target: 'multiple', value: 'notBetween' },
  ];

export const RBTH_MULTI_OPTION_FILTER_OPERATORS: RbthFilterOperatorOption<RbthMultiOptionFilterOperator>[] =
  [
    { label: 'includes', target: 'single', value: 'include' },
    { label: 'excludes', target: 'single', value: 'exclude' },
    { label: 'includes any of', target: 'multiple', value: 'includeAnyOf' },
    { label: 'includes all of', target: 'multiple', value: 'includeAllOf' },
    { label: 'excludes any of', target: 'multiple', value: 'excludeIfAnyOf' },
    { label: 'excludes all of', target: 'multiple', value: 'excludeIfAll' },
  ];

export const RBTH_NUMBER_FILTER_OPERATORS: RbthFilterOperatorOption<RbthNumberFilterOperator>[] =
  [
    { label: 'is', target: 'single', value: 'equals' },
    { label: 'is not', target: 'single', value: 'notEquals' },
    { label: 'is less than', target: 'single', value: 'lessThan' },
    {
      label: 'is less than or equal to',
      target: 'single',
      value: 'lessThanOrEqual',
    },
    { label: 'is greater than', target: 'single', value: 'greaterThan' },
    {
      label: 'is greater than or equal to',
      target: 'single',
      value: 'greaterThanOrEqual',
    },
    { label: 'is between', target: 'multiple', value: 'between' },
    { label: 'is not between', target: 'multiple', value: 'notBetween' },
  ];

export const RBTH_OPTION_FILTER_OPERATORS: RbthFilterOperatorOption<RbthOptionFilterOperator>[] =
  [
    { label: 'is', target: 'single', value: 'is' },
    { label: 'is not', target: 'single', value: 'isNot' },
    { label: 'is any of', target: 'multiple', value: 'isAnyOf' },
    { label: 'is none of', target: 'multiple', value: 'isNoneOf' },
  ];

export const RBTH_PRINCIPAL_FILTER_OPERATORS: RbthFilterOperatorOption<RbthPrincipalFilterOperator>[] =
  [
    { label: 'is', target: 'single', value: 'is' },
    { label: 'is not', target: 'single', value: 'isNot' },
    { label: 'is any of', target: 'multiple', value: 'isAnyOf' },
    { label: 'is none of', target: 'multiple', value: 'isNoneOf' },
  ];

export const RBTH_TEXT_FILTER_OPERATORS: RbthFilterOperatorOption<RbthTextFilterOperator>[] =
  [
    { label: 'contains', target: 'single', value: 'contains' },
    {
      label: 'does not contain',
      target: 'single',
      value: 'doesNotContain',
    },
  ];

export const RBTH_FILTER_OPERATORS = {
  boolean: RBTH_BOOLEAN_FILTER_OPERATORS,
  custom: RBTH_CUSTOM_FILTER_OPERATORS,
  date: RBTH_DATE_FILTER_OPERATORS,
  multiOption: RBTH_MULTI_OPTION_FILTER_OPERATORS,
  number: RBTH_NUMBER_FILTER_OPERATORS,
  option: RBTH_OPTION_FILTER_OPERATORS,
  principal: RBTH_PRINCIPAL_FILTER_OPERATORS,
  text: RBTH_TEXT_FILTER_OPERATORS,
};

export function rbthDefaultOperator(
  type: 'boolean',
  valueCount: number,
): RbthBooleanFilterOperator;
export function rbthDefaultOperator(
  type: 'custom',
  valueCount: number,
): RbthCustomFilterOperator;
export function rbthDefaultOperator(
  type: 'date',
  valueCount: number,
): RbthDateFilterOperator;
export function rbthDefaultOperator(
  type: 'multiOption',
  valueCount: number,
): RbthMultiOptionFilterOperator;
export function rbthDefaultOperator(
  type: 'number',
  valueCount: number,
): RbthNumberFilterOperator;
export function rbthDefaultOperator(
  type: 'option',
  valueCount: number,
): RbthOptionFilterOperator;
export function rbthDefaultOperator(
  type: 'principal',
  valueCount: number,
): RbthPrincipalFilterOperator;
export function rbthDefaultOperator(
  type: 'text',
  valueCount: number,
): RbthTextFilterOperator;
export function rbthDefaultOperator(
  type: RbthFilterColumnType,
  valueCount: number,
): RbthFilterOperator {
  switch (type) {
    case 'boolean':
      return 'is';
    case 'custom':
      return valueCount > 1 ? 'isAnyOf' : 'is';
    case 'date':
      return valueCount > 1 ? 'between' : 'on';
    case 'multiOption':
      return valueCount > 1 ? 'includeAnyOf' : 'include';
    case 'number':
      return valueCount > 1 ? 'between' : 'equals';
    case 'option':
      return valueCount > 1 ? 'isAnyOf' : 'is';
    case 'principal':
      return valueCount > 1 ? 'isAnyOf' : 'is';
    case 'text':
      return 'contains';
  }
}

export function rbthFilterOperatorLabel(
  type: RbthFilterColumnType,
  operator: RbthFilterOperator,
): string {
  return (
    RBTH_FILTER_OPERATORS[type].find((option) => option.value === operator)
      ?.label ?? operator
  );
}

export function rbthFilterOperatorTarget(
  type: RbthFilterColumnType,
  operator: RbthFilterOperator,
): 'multiple' | 'single' {
  return (
    RBTH_FILTER_OPERATORS[type].find((option) => option.value === operator)
      ?.target ?? 'single'
  );
}

export type {
  RbthBooleanFilterOperator,
  RbthCustomFilterOperator,
  RbthDateFilterOperator,
  RbthMultiOptionFilterOperator,
  RbthNumberFilterOperator,
  RbthOptionFilterOperator,
  RbthPrincipalFilterOperator,
  RbthTextFilterOperator,
};
