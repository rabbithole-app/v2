import { computed, Directive, input } from '@angular/core';

import { injectHlmIconConfig } from './hlm-icon.token';

export type IconSize = (Record<never, never> & string) | 'base' | 'lg' | 'none' | 'sm' | 'xl' | 'xs';

@Directive({
	selector: 'ng-icon[hlmIcon], ng-icon[hlm]',
	host: {
		'[style.--ng-icon__size]': '_computedSize()',
	},
})
export class HlmIcon {
	private readonly _config = injectHlmIconConfig();
	public readonly size = input<IconSize>(this._config.size);

	protected readonly _computedSize = computed(() => {
		const size = this.size();

		switch (size) {
			case 'base':
				return '24px';
			case 'lg':
				return '32px';
			case 'sm':
				return '16px';
			case 'xl':
				return '48px';
			case 'xs':
				return '12px';
			default: {
				return size;
			}
		}
	});
}
