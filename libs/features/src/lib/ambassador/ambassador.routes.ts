import { Route } from '@angular/router';

import { AmbassadorPageComponent } from './pages/ambassador-page/ambassador-page.component';

export const ambassadorRoutes: Route[] = [
  {
    path: '',
    component: AmbassadorPageComponent,
    title: 'Ambassador',
  },
];
