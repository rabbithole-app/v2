import { IconName } from '@ng-icons/core';

// Helper function to format bytes to human-readable format
export const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

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
