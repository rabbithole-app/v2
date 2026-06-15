import { Route } from '@angular/router';

import {
  PermissionsService,
  provideEncryptedStorage,
  provideUploadFilesService,
} from '@rabbithole/core/storage-runtime';

import { FileListViewComponent } from './components/file-list-view/file-list-view.component';
import { fileListResolver } from './resolvers/file-list';

const fileListProviders = [
  provideEncryptedStorage(),
  provideUploadFilesService(),
  PermissionsService,
] satisfies Route['providers'];

export const fileListRoutes: Route[] = [
  {
    path: '',
    providers: fileListProviders,
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
    providers: fileListProviders,
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
