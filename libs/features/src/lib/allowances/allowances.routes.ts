import { Route } from '@angular/router';

import { AllowancesPageComponent } from './pages/allowances-page/allowances-page.component';

export const allowancesRoutes: Route[] = [
  {
    path: '',
    component: AllowancesPageComponent,
    title: 'Allowances',
  },
];
