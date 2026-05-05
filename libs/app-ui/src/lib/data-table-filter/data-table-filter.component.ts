import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  input,
  model,
  signal,
} from '@angular/core';
import { Principal } from '@icp-sdk/core/principal';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCalendarDays,
  lucideChevronDown,
  lucideHash,
  lucideListFilter,
  lucidePlus,
  lucideSearch,
  lucideTag,
  lucideText,
  lucideX,
} from '@ng-icons/lucide';

import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmButtonGroupImports } from '@spartan-ng/helm/button-group';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';
import { HlmComboboxImports } from '@spartan-ng/helm/combobox';
import { HlmDatePickerImports } from '@spartan-ng/helm/date-picker';
import { HlmDropdownMenuImports } from '@spartan-ng/helm/dropdown-menu';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { HlmInput } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

import {
  RbthFilterValueContext,
  RbthFilterValueDirective,
} from './filter-value.directive';
import {
  RBTH_BOOLEAN_FILTER_OPERATORS,
  RBTH_CUSTOM_FILTER_OPERATORS,
  RBTH_DATE_FILTER_OPERATORS,
  RBTH_FILTER_OPERATORS,
  RBTH_MULTI_OPTION_FILTER_OPERATORS,
  RBTH_NUMBER_FILTER_OPERATORS,
  RBTH_OPTION_FILTER_OPERATORS,
  RBTH_PRINCIPAL_FILTER_OPERATORS,
  RBTH_TEXT_FILTER_OPERATORS,
  rbthDefaultOperator,
  rbthFilterOperatorLabel,
  rbthFilterOperatorTarget,
} from './operators';
import { RbthTransparentSelectBackdropDirective } from './transparent-select-backdrop.directive';
import {
  RbthBooleanFilterOperator,
  RbthCustomFilterModel,
  RbthCustomFilterOperator,
  RbthDateFilterOperator,
  RbthFilterColumnType,
  RbthFilterModel,
  RbthFilterOperator,
  RbthFilterOperatorOption,
  RbthFilterOption,
  RbthFiltersState,
  RbthMultiOptionFilterOperator,
  RbthNumberFilterOperator,
  RbthOptionFilterOperator,
  RbthPrincipalFilterOperator,
  RbthTextFilterOperator,
} from './types';

interface RbthFilterViewColumn {
  falseLabel?: string;
  iconName?: string;
  id: string;
  label: string;
  operators?: ReadonlyArray<RbthFilterOperator>;
  options?: RbthFilterOption[];
  trueLabel?: string;
  type: RbthFilterColumnType;
}

@Component({
  selector: 'rbth-data-table-filter',
  imports: [
    HlmBadge,
    HlmIcon,
    HlmInput,
    NgTemplateOutlet,
    NgIcon,
    RbthTransparentSelectBackdropDirective,
    ...HlmButtonGroupImports,
    ...HlmButtonImports,
    ...HlmCheckboxImports,
    ...HlmComboboxImports,
    ...HlmDatePickerImports,
    ...HlmDropdownMenuImports,
    ...HlmSelectImports,
    ...HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideCalendarDays,
      lucideChevronDown,
      lucideHash,
      lucideListFilter,
      lucidePlus,
      lucideSearch,
      lucideTag,
      lucideText,
      lucideX,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
  templateUrl: './data-table-filter.component.html',
})
export class RbthDataTableFilterComponent {
  readonly columns = input.required<ReadonlyArray<RbthFilterViewColumn>>();
  readonly filters = model<RbthFiltersState>([]);
  readonly filterValueTemplates = contentChildren(RbthFilterValueDirective);
  protected readonly _availableColumns = computed(() => {
    const activeIds = new Set(this.filters().map((filter) => filter.columnId));
    return this.columns().filter((column) => !activeIds.has(column.id));
  });

  protected readonly _principalSearches = signal<Record<string, string>>({});

  private readonly _dateFormatter = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  protected _addFilter(column: RbthFilterViewColumn): void {
    this.filters.update((filters) => [
      ...filters.filter((filter) => filter.columnId !== column.id),
      this._initialFilter(column),
    ]);
  }

  protected _addPrincipalValue(
    filter: RbthFilterModel,
    value: string,
  ): void {
    if (filter.type !== 'principal') return;

    this._setPrincipalValues(filter, [...filter.values, value]);
  }

  protected _booleanLabel(value: boolean, column: RbthFilterViewColumn): string {
    return value
      ? (column.trueLabel ?? 'True')
      : (column.falseLabel ?? 'False');
  }

  protected _booleanValue(filter: RbthFilterModel): boolean {
    return filter.type === 'boolean' ? (filter.values[0] ?? false) : false;
  }

  protected _clearFilters(): void {
    this.filters.set([]);
  }

  protected _clearPrincipalValues(filter: RbthFilterModel): void {
    if (filter.type !== 'principal') return;

    this._replaceFilter(filter.columnId, {
      ...filter,
      values: [],
    });
  }

  protected _columnFor(columnId: string): RbthFilterViewColumn | undefined {
    return this.columns().find((column) => column.id === columnId);
  }

  protected _commitPrincipalSearch(filter: RbthFilterModel): void {
    const principalId = this._parsePrincipalId(this._principalSearch(filter));
    if (!principalId) return;

    if (this._usesRange(filter)) {
      this._addPrincipalValue(filter, principalId);
      return;
    }

    this._setPrincipalValue(filter, principalId);
  }

  protected _customValueContext(
    filter: RbthFilterModel,
  ): RbthFilterValueContext | null {
    if (filter.type !== 'custom') return null;

    return {
      $implicit: filter,
      filter,
      multiple: this._usesRange(filter),
      setValue: (value) => this._setCustomValue(filter, value),
      setValues: (values) => this._setCustomValues(filter, values),
      value: filter.values[0] ?? null,
      values: filter.values,
    };
  }

  protected _customValueTemplate(
    columnId: string,
  ): RbthFilterValueDirective | undefined {
    return this.filterValueTemplates().find(
      (template) => template.columnId() === columnId,
    );
  }

  protected _dateRangeValue(
    filter: RbthFilterModel,
  ): [Date, Date] | undefined {
    if (filter.type !== 'date') return undefined;

    return filter.values.length >= 2
      ? [filter.values[0], filter.values[1]]
      : undefined;
  }

  protected _dateValue(filter: RbthFilterModel): Date | undefined {
    if (filter.type !== 'date') return undefined;

    const value = filter.values[0];
    return value;
  }

  protected _fallbackIcon(type: RbthFilterColumnType): string {
    switch (type) {
      case 'boolean':
        return 'lucideTag';
      case 'custom':
        return 'lucideSearch';
      case 'date':
        return 'lucideCalendarDays';
      case 'multiOption':
        return 'lucideListFilter';
      case 'number':
        return 'lucideHash';
      case 'option':
        return 'lucideTag';
      case 'principal':
        return 'lucideHash';
      case 'text':
        return 'lucideText';
    }
  }

  protected _hasMultipleOperators(column: RbthFilterViewColumn): boolean {
    return this._operators(column).length > 1;
  }

  protected _inputValue(event: Event): string {
    return event.target instanceof HTMLInputElement ? event.target.value : '';
  }

  protected _numberValue(filter: RbthFilterModel, index: number): string {
    const value = filter.values[index];
    return typeof value === 'number' && !Number.isNaN(value)
      ? String(value)
      : '';
  }

  protected _operatorLabel(filter: RbthFilterModel): string {
    return rbthFilterOperatorLabel(filter.type, filter.operator);
  }

  protected _operators(
    column: RbthFilterViewColumn,
  ): ReadonlyArray<RbthFilterOperatorOption> {
    const operators = RBTH_FILTER_OPERATORS[column.type];

    if (!column.operators?.length) return operators;

    const allowed = new Set<RbthFilterOperator>(column.operators);
    return operators.filter((operator) => allowed.has(operator.value));
  }

  protected _principalComboboxOptions(filter: RbthFilterModel): string[] {
    if (filter.type !== 'principal') return [];

    return [...new Set([...filter.values, ...this._principalOptions(filter)])];
  }

  protected readonly _principalIsItemEqualToValue = (
    item: string | null,
    value: string | null,
  ) => item === value;

  protected readonly _principalItemToString = (value: string | null) =>
    value ?? '';

  protected _principalOptions(filter: RbthFilterModel): string[] {
    const principalId = this._parsePrincipalId(this._principalSearch(filter));
    if (!principalId || filter.type !== 'principal') return [];

    return filter.values.includes(principalId) ? [] : [principalId];
  }

  protected _principalSearch(filter: RbthFilterModel): string {
    return this._principalSearches()[filter.columnId] ?? '';
  }

  protected _principalSelectedSummary(values: ReadonlyArray<unknown>): string {
    const count = values.length;
    return count === 1 ? '1 selected' : `${count} selected`;
  }

  protected _principalValue(filter: RbthFilterModel): string | null {
    return filter.type === 'principal' ? (filter.values[0] ?? null) : null;
  }

  protected _principalValues(filter: RbthFilterModel): string[] {
    return filter.type === 'principal' ? filter.values : [];
  }

  protected _removeFilter(columnId: string): void {
    this.filters.update((filters) =>
      filters.filter((filter) => filter.columnId !== columnId),
    );
  }

  protected _selectedValuesSummary(
    values: ReadonlyArray<unknown> | null,
    column: RbthFilterViewColumn,
  ): string {
    if (!values?.length) return 'Set value';

    const labels = values.map((value) => {
      if (typeof value !== 'string') return String(value);

      return (
        column.options?.find((option) => option.value === value)?.label ?? value
      );
    });

    return labels.length > 1
      ? `${labels[0]} (+${labels.length - 1} more)`
      : labels[0];
  }

  protected _selectValue(filter: RbthFilterModel): string | undefined {
    return filter.type === 'option' ? filter.values[0] : undefined;
  }

  protected _selectValues(filter: RbthFilterModel): string[] {
    return filter.type === 'option' || filter.type === 'multiOption'
      ? filter.values
      : [];
  }

  protected _setBooleanValue(filter: RbthFilterModel, value: boolean): void {
    if (filter.type !== 'boolean') return;

    this._replaceFilter(filter.columnId, {
      ...filter,
      values: [value],
    });
  }

  protected _setCustomValue(
    filter: RbthCustomFilterModel,
    value: unknown | null | undefined,
  ): void {
    this._replaceFilter(filter.columnId, {
      ...filter,
      values: value === null || value === undefined ? [] : [value],
    });
  }

  protected _setCustomValues(
    filter: RbthCustomFilterModel,
    values: ReadonlyArray<unknown> | null | undefined,
  ): void {
    const nextValues = [...(values ?? [])];
    this._replaceFilter(filter.columnId, {
      ...filter,
      values: this._usesRange(filter) ? nextValues : nextValues.slice(0, 1),
    });
  }

  protected _setDateRangeValue(
    filter: RbthFilterModel,
    value: [Date, Date] | null,
  ): void {
    if (filter.type !== 'date') return;

    this._replaceFilter(filter.columnId, {
      ...filter,
      values: value ? [value[0], value[1]] : [],
    });
  }

  protected _setDateValue(filter: RbthFilterModel, value: Date): void {
    if (filter.type !== 'date') return;

    this._replaceFilter(filter.columnId, {
      ...filter,
      values: value ? [value] : [],
    });
  }

  protected _setNumberValue(
    filter: RbthFilterModel,
    index: number,
    rawValue: string,
  ): void {
    if (filter.type !== 'number') return;

    const next = [...filter.values];
    const value = Number(rawValue);
    if (rawValue === '' || Number.isNaN(value)) {
      next.splice(index, 1);
    } else {
      next[index] = value;
    }
    this._replaceFilter(filter.columnId, {
      ...filter,
      values: next.filter((item) => typeof item === 'number'),
    });
  }

  protected _setOperator(
    filter: RbthFilterModel,
    operator: RbthFilterOperator,
  ): void {
    const column = this._columnFor(filter.columnId);
    if (column && !this._isOperatorAllowed(column, operator)) return;

    const target = rbthFilterOperatorTarget(filter.type, operator);

    switch (filter.type) {
      case 'boolean': {
        if (!this._isBooleanOperator(operator)) return;
        this._replaceFilter(filter.columnId, { ...filter, operator });
        return;
      }
      case 'custom': {
        if (!this._isCustomOperator(operator)) return;
        const values =
          target === 'single' ? filter.values.slice(0, 1) : filter.values;
        this._replaceFilter(filter.columnId, { ...filter, operator, values });
        return;
      }
      case 'date': {
        if (!this._isDateOperator(operator)) return;
        const values =
          target === 'single' ? filter.values.slice(0, 1) : filter.values;
        this._replaceFilter(filter.columnId, { ...filter, operator, values });
        return;
      }
      case 'multiOption': {
        if (!this._isMultiOptionOperator(operator)) return;
        const values =
          target === 'single' ? filter.values.slice(0, 1) : filter.values;
        this._replaceFilter(filter.columnId, { ...filter, operator, values });
        return;
      }
      case 'number': {
        if (!this._isNumberOperator(operator)) return;
        const values =
          target === 'single' ? filter.values.slice(0, 1) : filter.values;
        this._replaceFilter(filter.columnId, { ...filter, operator, values });
        return;
      }
      case 'option': {
        if (!this._isOptionOperator(operator)) return;
        const values =
          target === 'single' ? filter.values.slice(0, 1) : filter.values;
        this._replaceFilter(filter.columnId, { ...filter, operator, values });
        return;
      }
      case 'principal': {
        if (!this._isPrincipalOperator(operator)) return;
        const values =
          target === 'single' ? filter.values.slice(0, 1) : filter.values;
        this._replaceFilter(filter.columnId, { ...filter, operator, values });
        return;
      }
      case 'text': {
        if (!this._isTextOperator(operator)) return;
        const values =
          target === 'single' ? filter.values.slice(0, 1) : filter.values;
        this._replaceFilter(filter.columnId, { ...filter, operator, values });
        return;
      }
    }
  }

  protected _setPrincipalSearch(filter: RbthFilterModel, value: string): void {
    this._principalSearches.update((searches) => ({
      ...searches,
      [filter.columnId]: value,
    }));
  }

  protected _setPrincipalValue(
    filter: RbthFilterModel,
    value: unknown,
  ): void {
    if (filter.type !== 'principal') return;

    const principalId =
      typeof value === 'string' ? this._parsePrincipalId(value) : undefined;

    this._replaceFilter(filter.columnId, {
      ...filter,
      values: principalId ? [principalId] : [],
    });
    this._setPrincipalSearch(filter, '');
  }

  protected _setPrincipalValues(
    filter: RbthFilterModel,
    values: ReadonlyArray<unknown> | null,
  ): void {
    if (filter.type !== 'principal') return;

    const normalizedValues = (values ?? [])
      .filter((value): value is string => typeof value === 'string')
      .map((value) => this._parsePrincipalId(value))
      .filter((value): value is string => value !== undefined);

    const uniqueValues = [...new Set(normalizedValues)];
    const nextValues = this._usesRange(filter)
      ? uniqueValues
      : uniqueValues.slice(0, 1);

    this._replaceFilter(filter.columnId, {
      ...filter,
      values: nextValues,
    });
    this._setPrincipalSearch(filter, '');
  }

  protected _setSelectValue(
    filter: RbthFilterModel,
    value: string | null | undefined,
  ): void {
    if (filter.type !== 'option') return;

    const values = value ? [value] : [];
    this._replaceFilter(filter.columnId, {
      ...filter,
      operator: this._optionOperator(filter.columnId, values.length),
      values,
    });
  }

  protected _setSelectValues(
    filter: RbthFilterModel,
    values: string[] | null,
  ): void {
    if (filter.type !== 'option' && filter.type !== 'multiOption') return;

    const nextValues = values ?? [];

    if (filter.type === 'option') {
      this._replaceFilter(filter.columnId, {
        ...filter,
        operator: this._optionOperator(filter.columnId, nextValues.length),
        values: nextValues,
      });
      return;
    }

    this._replaceFilter(filter.columnId, {
      ...filter,
      operator: this._multiOptionOperator(filter.columnId, nextValues.length),
      values: nextValues,
    });
  }

  protected _setTextValue(filter: RbthFilterModel, value: string): void {
    if (filter.type !== 'text') return;

    this._replaceFilter(filter.columnId, {
      ...filter,
      values: [value],
    });
  }

  protected _shortPrincipal(principalId: string): string {
    return principalId.length > 18
      ? `${principalId.slice(0, 8)}...${principalId.slice(-6)}`
      : principalId;
  }

  protected _textValue(filter: RbthFilterModel): string {
    return typeof filter.values[0] === 'string'
      ? String(filter.values[0])
      : '';
  }

  protected _usesRange(filter: RbthFilterModel): boolean {
    return rbthFilterOperatorTarget(filter.type, filter.operator) === 'multiple';
  }

  protected _valueSummary(
    filter: RbthFilterModel,
    column: RbthFilterViewColumn,
  ): string {
    if (!filter.values.length) return 'Set value';

    if (filter.type === 'boolean') {
      return this._booleanLabel(
        filter.values[0],
        column,
      );
    }

    if (filter.type === 'date') {
      return filter.values
        .map((value) => this._dateFormatter.format(value))
        .join(' - ');
    }

    if (
      (filter.type === 'option' || filter.type === 'multiOption') &&
      (column.type === 'option' || column.type === 'multiOption')
    ) {
      return filter.values
        .map(
          (value) =>
            column.options?.find((option) => option.value === value)?.label ??
            value,
        )
        .join(', ');
    }

    return filter.values.join(' - ');
  }

  private _initialFilter(column: RbthFilterViewColumn): RbthFilterModel {
    switch (column.type) {
      case 'boolean':
        return {
          columnId: column.id,
          operator: this._operatorOrFallback(
            column.operators,
            rbthDefaultOperator('boolean', 1),
            (operator) => this._isBooleanOperator(operator),
          ),
          type: 'boolean',
          values: [false],
        };
      case 'custom':
        return {
          columnId: column.id,
          operator: this._operatorOrFallback(
            column.operators,
            rbthDefaultOperator('custom', 0),
            (operator) => this._isCustomOperator(operator),
          ),
          type: 'custom',
          values: [],
        };
      case 'date':
        return {
          columnId: column.id,
          operator: this._operatorOrFallback(
            column.operators,
            rbthDefaultOperator('date', 0),
            (operator) => this._isDateOperator(operator),
          ),
          type: 'date',
          values: [],
        };
      case 'multiOption':
        return {
          columnId: column.id,
          operator: this._operatorOrFallback(
            column.operators,
            rbthDefaultOperator('multiOption', 0),
            (operator) => this._isMultiOptionOperator(operator),
          ),
          type: 'multiOption',
          values: [],
        };
      case 'number':
        return {
          columnId: column.id,
          operator: this._operatorOrFallback(
            column.operators,
            rbthDefaultOperator('number', 0),
            (operator) => this._isNumberOperator(operator),
          ),
          type: 'number',
          values: [],
        };
      case 'option':
        return {
          columnId: column.id,
          operator: this._operatorOrFallback(
            column.operators,
            rbthDefaultOperator('option', 0),
            (operator) => this._isOptionOperator(operator),
          ),
          type: 'option',
          values: [],
        };
      case 'principal':
        return {
          columnId: column.id,
          operator: this._operatorOrFallback(
            column.operators,
            rbthDefaultOperator('principal', 0),
            (operator) => this._isPrincipalOperator(operator),
          ),
          type: 'principal',
          values: [],
        };
      case 'text':
        return {
          columnId: column.id,
          operator: this._operatorOrFallback(
            column.operators,
            rbthDefaultOperator('text', 1),
            (operator) => this._isTextOperator(operator),
          ),
          type: 'text',
          values: [''],
        };
    }
  }

  private _isBooleanOperator(
    operator: RbthFilterOperator,
  ): operator is RbthBooleanFilterOperator {
    return RBTH_BOOLEAN_FILTER_OPERATORS.some((item) => item.value === operator);
  }

  private _isCustomOperator(
    operator: RbthFilterOperator,
  ): operator is RbthCustomFilterOperator {
    return RBTH_CUSTOM_FILTER_OPERATORS.some((item) => item.value === operator);
  }

  private _isDateOperator(
    operator: RbthFilterOperator,
  ): operator is RbthDateFilterOperator {
    return RBTH_DATE_FILTER_OPERATORS.some((item) => item.value === operator);
  }

  private _isMultiOptionOperator(
    operator: RbthFilterOperator,
  ): operator is RbthMultiOptionFilterOperator {
    return RBTH_MULTI_OPTION_FILTER_OPERATORS.some(
      (item) => item.value === operator,
    );
  }

  private _isNumberOperator(
    operator: RbthFilterOperator,
  ): operator is RbthNumberFilterOperator {
    return RBTH_NUMBER_FILTER_OPERATORS.some((item) => item.value === operator);
  }

  private _isOperatorAllowed(
    column: RbthFilterViewColumn,
    operator: RbthFilterOperator,
  ): boolean {
    return !column.operators?.length || column.operators.includes(operator);
  }

  private _isOptionOperator(
    operator: RbthFilterOperator,
  ): operator is RbthOptionFilterOperator {
    return RBTH_OPTION_FILTER_OPERATORS.some((item) => item.value === operator);
  }

  private _isPrincipalOperator(
    operator: RbthFilterOperator,
  ): operator is RbthPrincipalFilterOperator {
    return RBTH_PRINCIPAL_FILTER_OPERATORS.some(
      (item) => item.value === operator,
    );
  }

  private _isTextOperator(
    operator: RbthFilterOperator,
  ): operator is RbthTextFilterOperator {
    return RBTH_TEXT_FILTER_OPERATORS.some((item) => item.value === operator);
  }

  private _multiOptionOperator(
    columnId: string,
    valueCount: number,
  ): RbthMultiOptionFilterOperator {
    return this._operatorOrFallback(
      this._columnFor(columnId)?.operators,
      rbthDefaultOperator('multiOption', valueCount),
      (operator) => this._isMultiOptionOperator(operator),
    );
  }

  private _operatorOrFallback<TOperator extends RbthFilterOperator>(
    operators: ReadonlyArray<RbthFilterOperator> | undefined,
    fallback: TOperator,
    isOperator: (operator: RbthFilterOperator) => operator is TOperator,
  ): TOperator {
    if (!operators?.length) return fallback;

    const availableOperators = operators.filter(isOperator);
    return (
      availableOperators.find((operator) => operator === fallback) ??
      availableOperators[0] ??
      fallback
    );
  }

  private _optionOperator(
    columnId: string,
    valueCount: number,
  ): RbthOptionFilterOperator {
    return this._operatorOrFallback(
      this._columnFor(columnId)?.operators,
      rbthDefaultOperator('option', valueCount),
      (operator) => this._isOptionOperator(operator),
    );
  }

  private _parsePrincipalId(value: string): string | undefined {
    try {
      return Principal.fromText(value.trim()).toText();
    } catch {
      return undefined;
    }
  }

  private _principalOperator(
    columnId: string,
    valueCount: number,
  ): RbthPrincipalFilterOperator {
    return this._operatorOrFallback(
      this._columnFor(columnId)?.operators,
      rbthDefaultOperator('principal', valueCount),
      (operator) => this._isPrincipalOperator(operator),
    );
  }

  private _replaceFilter(columnId: string, nextFilter: RbthFilterModel): void {
    this.filters.update((filters) =>
      filters.map((filter) =>
        filter.columnId === columnId ? nextFilter : filter,
      ),
    );
  }
}
