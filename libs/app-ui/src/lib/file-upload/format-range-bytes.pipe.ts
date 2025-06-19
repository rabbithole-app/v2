import { Pipe, PipeTransform } from '@angular/core';

import { formatBytes } from './file-upload.utils';

@Pipe({
  name: 'formatRangeBytes',
})
export class FormatRangeBytesPipe implements PipeTransform {
  transform(current: number, total: number, decimal?: number) {
    return `${formatBytes(current, decimal)} of ${formatBytes(total, decimal)}`;
  }
}
