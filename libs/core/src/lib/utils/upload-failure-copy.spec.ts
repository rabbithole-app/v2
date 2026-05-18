import { describe, expect, it } from 'vitest';

import { getUploadFailureCopy } from './upload-failure-copy';

describe('getUploadFailureCopy', () => {
  it('maps unauthorized storage errors to upload permission copy', () => {
    expect(getUploadFailureCopy('unauthorized')).toEqual({
      title: 'No upload permission',
      description: 'Ask the storage owner to grant ReadWrite access, then retry.',
      technicalDetails: 'unauthorized',
    });
  });

  it('maps typed permission-denied storage errors to upload permission copy', () => {
    expect(
      getUploadFailureCopy(
        '[PermissionDenied] permission denied: caller abc requires ReadWrite access for file file.txt',
      ).title,
    ).toBe('No upload permission');
  });

  it('keeps unknown errors visible as the description', () => {
    expect(getUploadFailureCopy('Replica rejected the call')).toEqual({
      title: 'Upload failed',
      description: 'Replica rejected the call',
      technicalDetails: 'Replica rejected the call',
    });
  });
});
