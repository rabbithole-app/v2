import { IconName } from '@ng-icons/core';

export const getFileIcon = ({
  name,
  type,
}: File | { name: string; type: string }): IconName => {
  if (
    type.includes('pdf') ||
    name.endsWith('.pdf') ||
    type.includes('word') ||
    name.endsWith('.doc') ||
    name.endsWith('.docx')
  ) {
    return 'lucideFileText';
  } else if (
    type.includes('zip') ||
    type.includes('archive') ||
    name.endsWith('.zip') ||
    name.endsWith('.rar')
  ) {
    return 'lucideFileArchive';
  } else if (
    type.includes('excel') ||
    name.endsWith('.xls') ||
    name.endsWith('.xlsx')
  ) {
    return 'lucideFileSpreadsheet';
  } else if (type.includes('video/')) {
    return 'lucideVideo';
  } else if (type.includes('audio/')) {
    return 'lucideHeadphones';
  } else if (type.startsWith('image/')) {
    return 'lucideImage';
  }

  return 'lucideFile';
};
