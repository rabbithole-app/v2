import { Injectable } from '@angular/core';
import {
  showDirectoryPicker,
  showOpenFilePicker,
} from 'native-file-system-adapter';

@Injectable()
export class BrowserFSPicker {
  // Methods for working with File System Access API
  showDirectoryPicker(...args: Parameters<typeof showDirectoryPicker>) {
    return showDirectoryPicker(...args);
  }

  showOpenFilePicker(...args: Parameters<typeof showOpenFilePicker>) {
    return showOpenFilePicker(...args);
  }
}
