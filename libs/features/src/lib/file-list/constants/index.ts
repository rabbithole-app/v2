import { DirectoryColor, FileListIconsConfig } from '../types';

export const FOLDER_COLORS: Record<
  DirectoryColor,
  { back: string; cover: string; icon: string }
> = {
  blue: { cover: '#75d0fa', back: '#3fa1d6', icon: '#3fa1d6' },
  yellow: { cover: '#ffed93', back: '#fbb653', icon: '#fbb653' },
  orange: { cover: '#ffbb00', back: '#ffac00', icon: '#ffac00' },
  purple: { cover: '#b6bfff', back: '#848ff4', icon: '#848ff4' },
  pink: { cover: '#ffc3ce', back: '#fa8295', icon: '#fa8295' },
  gray: { cover: '#d9d9d9', back: '#b9b9b9', icon: '#b9b9b9' },
  green: { cover: '#b9ddaf', back: '#9cc093', icon: '#9cc093' },
};

export const COLOR_KEYS: DirectoryColor[] = [
  'blue',
  'yellow',
  'orange',
  'purple',
  'pink',
  'gray',
  'green',
];

export const GRAY_ICONS_CONFIG: FileListIconsConfig = {
  namespace: 'filetype-grey',
  value: {
    font: ['woff', 'woff2', 'eof', 'eot', 'otf', 'ttf'],
    archive: ['zip', 'rar', 'ice', 'gz', 'gzip', 'tar', 'tar.gz', 'ace'],
    vector: ['ai', 'cdr', 'eps', 'bmml', 'indd', 'svg'],
    text: ['doc', 'docx', 'dot', 'dotx', 'md', 'rtf'],
    code: ['css', 'js', 'json', 'less', 'scss'],
    sketch: ['sketch'],
    image: ['psd', 'tiff', 'gif', 'ico', 'jpg', 'jpeg', 'png'],
    html: ['html'],
    video: ['mkv', 'avi', 'webm', 'wmv', 'mov', 'mpeg', 'mp3', 'mp4'],
    xls: ['xls', 'xlsx'],
    pdf: ['pdf'],
    dmg: ['dmg'],
    unknown: [],
    blank: [],
  },
  path: 'icons/file-types/gray/',
};
