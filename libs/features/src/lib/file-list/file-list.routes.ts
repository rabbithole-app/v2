import { Route } from '@angular/router';

import { FileListViewComponent } from './components/file-list-view/file-list-view.component';
import { fileListResolver } from './resolvers/file-list';

export const fileListRoutes: Route[] = [
  {
    path: '',
    resolve: {
      fileList: fileListResolver,
    },
    component: FileListViewComponent,
  },
  {
    path: '**',
    resolve: {
      fileList: fileListResolver,
    },
    component: FileListViewComponent,
  },
];

