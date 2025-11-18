import { InjectionToken } from '@angular/core';

import { IUploadService } from '../types';

export const UPLOAD_SERVICE_TOKEN = new InjectionToken<IUploadService>(
  'UPLOAD_SERVICE_TOKEN',
);
