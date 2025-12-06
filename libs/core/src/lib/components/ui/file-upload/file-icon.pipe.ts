import { Pipe, PipeTransform } from '@angular/core';

import { getFileIcon } from '../../../utils';

@Pipe({
  name: 'fileIcon',
})
export class FileIconPipe implements PipeTransform {
  transform = getFileIcon;
}
