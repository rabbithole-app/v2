import { Route } from '@angular/router';

import { FileListViewComponent } from './components/file-list-view/file-list-view.component';
import { fileListResolver } from './resolvers/file-list';

export const fileListRoutes: Route[] = [
  {
    path: '',
    data: {
      header: {
        title: 'Storage',
      },
    },
    resolve: {
      fileList: fileListResolver,
    },
    component: FileListViewComponent,
  },
  {
    path: '**',
    data: {
      header: {
        title: 'Storage',
      },
    },
    resolve: {
      fileList: fileListResolver,
    },
    component: FileListViewComponent,
  },
];
