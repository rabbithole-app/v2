import { Pipe, PipeTransform } from '@angular/core';

import { getFileIcon } from './file-upload.utils';

@Pipe({
  name: 'fileIcon',
})
export class FileIconPipe implements PipeTransform {
  transform = getFileIcon;
}
