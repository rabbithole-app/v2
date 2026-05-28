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

  it('maps included storage limit errors to upgrade copy', () => {
    expect(
      getUploadFailureCopy('[Internal] File size exceeds remaining included storage (68 MB remaining)'),
    ).toEqual({
      title: 'Included storage limit reached',
      description: 'Upgrade to Pro or choose a smaller file.',
      technicalDetails: '[Internal] File size exceeds remaining included storage (68 MB remaining)',
    });
  });

  it('maps included single-file limit errors to upgrade copy', () => {
    expect(
      getUploadFailureCopy('[Internal] File exceeds included storage file limit (100 MB max)'),
    ).toEqual({
      title: 'File too large for included storage',
      description: 'Upgrade to Pro or choose a smaller file.',
      technicalDetails: '[Internal] File exceeds included storage file limit (100 MB max)',
    });
  });

  it('maps storage version mismatches to update copy', () => {
    expect(
      getUploadFailureCopy(
        'Storage update required before uploading. Upgrade this storage canister, then retry.',
      ),
    ).toEqual({
      title: 'Storage update required',
      description: 'Upgrade this storage canister, then retry the upload.',
      technicalDetails:
        'Storage update required before uploading. Upgrade this storage canister, then retry.',
    });
  });

  it('maps storage cycles errors to top-up copy', () => {
    expect(
      getUploadFailureCopy(
        '[InsufficientCycles] Insufficient storage canister cycles: Auto top-up is disabled',
      ),
    ).toEqual({
      title: 'Auto top-up disabled',
      description: 'Enable auto top-up or top up this storage canister manually, then retry.',
      technicalDetails: '[InsufficientCycles] Insufficient storage canister cycles: Auto top-up is disabled',
    });
  });

  it('maps raw replica out-of-cycles errors to top-up copy', () => {
    expect(
      getUploadFailureCopy(
        'Canister uxrrr-q7777-77774-qaaaq-cai is out of cycles: please top up the canister',
      ).title,
    ).toBe('Storage needs cycles');
  });

  it('maps manual OnChain funding errors to top-up copy', () => {
    expect(
      getUploadFailureCopy(
        '[InsufficientCycles] Manual OnChain funding required: start upload session requires target balance 1686724551190 cycles before starting a new upload.',
      ),
    ).toEqual({
      title: 'Storage needs cycles',
      description: 'Top up this OnChain storage canister or upgrade to Pro for managed funding, then retry.',
      technicalDetails:
        '[InsufficientCycles] Manual OnChain funding required: start upload session requires target balance 1686724551190 cycles before starting a new upload.',
    });
  });

  it('maps funding-pending storage errors to in-progress top-up copy', () => {
    expect(
      getUploadFailureCopy(
        '[FundingPending] Upload funding is pending: finish upload session requires cycles',
      ),
    ).toEqual({
      title: 'Storage top-up in progress',
      description: 'Keep this upload open while the storage canister receives cycles.',
      technicalDetails: '[FundingPending] Upload funding is pending: finish upload session requires cycles',
    });
  });

  it('maps backend funding cooldown errors to in-progress top-up copy', () => {
    expect(
      getUploadFailureCopy(
        '[FundingPending] Storage funding is already in progress',
      ),
    ).toEqual({
      title: 'Storage top-up in progress',
      description: 'Keep this upload open while the storage canister receives cycles.',
      technicalDetails: '[FundingPending] Storage funding is already in progress',
    });
  });

  it('maps exhausted Pro included funding to paid top-up copy', () => {
    expect(
      getUploadFailureCopy(
        '[InsufficientCycles] Insufficient storage canister cycles: Pro included storage funding is exhausted for the current period',
      ),
    ).toEqual({
      title: 'Included storage funding used',
      description: 'Enable paid auto top-up or top up this storage canister manually, then retry.',
      technicalDetails:
        '[InsufficientCycles] Insufficient storage canister cycles: Pro included storage funding is exhausted for the current period',
    });
  });

  it('maps treasury reserve failures to service funding copy', () => {
    expect(
      getUploadFailureCopy(
        '[InsufficientCycles] Insufficient storage canister cycles: auto top-up failed: Treasury ICP reserve low: balance 5.76724397 ICP, required debit 0.56828182 ICP, reserve 10 ICP',
      ),
    ).toEqual({
      title: 'Storage funding unavailable',
      description: 'Storage funding is temporarily unavailable. Try again after the service treasury is funded.',
      technicalDetails:
        '[InsufficientCycles] Insufficient storage canister cycles: auto top-up failed: Treasury ICP reserve low: balance 5.76724397 ICP, required debit 0.56828182 ICP, reserve 10 ICP',
    });
  });

  it('maps paid auto top-up balance failures to wallet funding copy', () => {
    expect(
      getUploadFailureCopy(
        '[InsufficientCycles] Insufficient storage canister cycles: auto top-up failed: No usable wallet balance for storage auto top-up. Add funds to a supported wallet balance, adjust spending priority, or top up this storage manually.',
      ),
    ).toEqual({
      title: 'No usable auto top-up balance',
      description: 'Add funds to a supported wallet balance, adjust spending priority, or top up this storage manually.',
      technicalDetails:
        '[InsufficientCycles] Insufficient storage canister cycles: auto top-up failed: No usable wallet balance for storage auto top-up. Add funds to a supported wallet balance, adjust spending priority, or top up this storage manually.',
    });
  });
});
