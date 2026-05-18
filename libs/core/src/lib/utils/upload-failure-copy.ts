export type UploadFailureCopy = {
  description: string;
  technicalDetails?: string;
  title: string;
};

const READ_WRITE_PERMISSION_MESSAGE =
  'Ask the storage owner to grant ReadWrite access, then retry.';

export function getUploadFailureCopy(errorMessage?: string): UploadFailureCopy {
  const technicalDetails = errorMessage?.trim() || undefined;
  const normalized = technicalDetails?.toLowerCase() ?? '';

  if (
    /\bunauthorized\b/.test(normalized) ||
    /\bforbidden\b/.test(normalized) ||
    normalized.includes('permission denied') ||
    normalized.includes('no readwrite permission')
  ) {
    return {
      title: 'No upload permission',
      description: READ_WRITE_PERMISSION_MESSAGE,
      technicalDetails,
    };
  }

  if (
    normalized.includes('failed to fetch') ||
    normalized.includes('network error') ||
    normalized.includes('timeout')
  ) {
    return {
      title: 'Connection interrupted',
      description: 'Check your connection and retry the upload.',
      technicalDetails,
    };
  }

  if (normalized.includes('upload aborted')) {
    return {
      title: 'Upload canceled',
      description: 'The upload was canceled before it finished.',
      technicalDetails,
    };
  }

  return {
    title: 'Upload failed',
    description: technicalDetails ?? 'Try again or choose another file.',
    technicalDetails,
  };
}
