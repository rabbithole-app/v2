import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmToaster } from '@spartan-ng/helm/sonner';
import { HlmSpinner } from '@spartan-ng/helm/spinner';
import { NgxSonnerToaster } from 'ngx-sonner';

@Component({
	selector: 'rbth-toaster',
	imports: [NgxSonnerToaster, HlmSpinner],
	template: `
		<ngx-sonner-toaster
			[class]="_computedClass()"
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
			[dir]="dir()"
			[style]="userStyle()"
		>
			<hlm-spinner class="size-4" loading-icon />
		</ngx-sonner-toaster>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RbthToaster extends HlmToaster {}
