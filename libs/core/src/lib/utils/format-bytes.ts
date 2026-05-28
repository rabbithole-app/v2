export const formatBytes = (bytes: bigint | number, decimals = 2): string => {
  const value = Number(bytes);
  if (value === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(value) / Math.log(k));

  return (
    Number.parseFloat((value / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
  );
};
