export type TreeNode = {
  children?: TreeNode[];
  kind?: 'directory' | 'file';
  name: string;
  path?: string;
};
