import {
  RbthBooleanFilterColumn,
  RbthCustomFilterColumn,
  RbthDateFilterColumn,
  RbthMultiOptionFilterColumn,
  RbthNumberFilterColumn,
  RbthOptionFilterColumn,
  RbthPrincipalFilterColumn,
  RbthTextFilterColumn,
} from './types';

export const rbthFilterColumn = {
  boolean<TData>(
    config: Omit<RbthBooleanFilterColumn<TData>, 'type'>,
  ): RbthBooleanFilterColumn<TData> {
    return { ...config, type: 'boolean' };
  },
  custom<TData>(
    config: Omit<RbthCustomFilterColumn<TData>, 'type'>,
  ): RbthCustomFilterColumn<TData> {
    return { ...config, type: 'custom' };
  },
  date<TData>(
    config: Omit<RbthDateFilterColumn<TData>, 'type'>,
  ): RbthDateFilterColumn<TData> {
    return { ...config, type: 'date' };
  },
  multiOption<TData>(
    config: Omit<RbthMultiOptionFilterColumn<TData>, 'type'>,
  ): RbthMultiOptionFilterColumn<TData> {
    return { ...config, type: 'multiOption' };
  },
  number<TData>(
    config: Omit<RbthNumberFilterColumn<TData>, 'type'>,
  ): RbthNumberFilterColumn<TData> {
    return { ...config, type: 'number' };
  },
  option<TData>(
    config: Omit<RbthOptionFilterColumn<TData>, 'type'>,
  ): RbthOptionFilterColumn<TData> {
    return { ...config, type: 'option' };
  },
  principal<TData>(
    config: Omit<RbthPrincipalFilterColumn<TData>, 'type'>,
  ): RbthPrincipalFilterColumn<TData> {
    return { ...config, type: 'principal' };
  },
  text<TData>(
    config: Omit<RbthTextFilterColumn<TData>, 'type'>,
  ): RbthTextFilterColumn<TData> {
    return { ...config, type: 'text' };
  },
};
