import { ChangeDetectionStrategy, Component } from '@angular/core';

import { HlmToaster } from '@spartan-ng/helm/sonner';

@Component({
	selector: 'rbth-toaster',
	imports: [HlmToaster],
	template: `
		<hlm-toaster
			[invert]="invert()"
			[theme]="theme()"
			[position]="position()"
			[hotKey]="hotKey()"
			[richColors]="richColors()"
			[expand]="expand()"
			[duration]="duration()"
			[visibleToasts]="visibleToasts()"
			[closeButton]="closeButton()"
			[toastOptions]="toastOptions()"
			[offset]="offset()"
			[style]="userStyle()"
		/>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthToaster extends HlmToaster {}
