export type FileMetadata = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
};

export type FileWithPreview = {
  file: File | FileMetadata;
  id: string;
  preview?: string;
};
