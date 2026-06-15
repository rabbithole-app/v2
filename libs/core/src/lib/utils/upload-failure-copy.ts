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

  if (normalized.includes('storage update required')) {
    return {
      title: 'Storage update required',
      description: 'Upgrade this storage canister, then retry the upload.',
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

  if (normalized.includes('file exceeds included storage file limit')) {
    return {
      title: 'File too large for Starter Vault',
      description: 'Upgrade to Pro or choose a smaller file.',
      technicalDetails,
    };
  }

  if (
    normalized.includes('file size exceeds remaining included storage') ||
    normalized.includes('included encrypted storage limit reached')
  ) {
    return {
      title: 'Starter Vault limit reached',
      description: 'Upgrade to Pro or choose a smaller file.',
      technicalDetails,
    };
  }

  if (normalized.includes('auto top-up is disabled')) {
    return {
      title: 'Auto top-up disabled',
      description: 'Enable auto top-up or top up this storage canister manually, then retry.',
      technicalDetails,
    };
  }

  if (normalized.includes('pro included storage funding is exhausted')) {
    return {
      title: 'Managed operations credit used',
      description: 'Enable paid auto top-up or top up this storage canister manually, then retry.',
      technicalDetails,
    };
  }

  if (
    normalized.includes('no usable wallet balance') ||
    normalized.includes('insufficient usable wallet balance') ||
    normalized.includes('insufficient balance for top-up')
  ) {
    return {
      title: 'No usable auto top-up balance',
      description: 'Add funds to a supported wallet balance, adjust spending priority, or top up this storage manually.',
      technicalDetails,
    };
  }

  if (
    normalized.includes('treasury icp reserve low') ||
    normalized.includes('service temporarily unavailable')
  ) {
    return {
      title: 'Storage funding unavailable',
      description: 'Storage funding is temporarily unavailable. Try again after the service treasury is funded.',
      technicalDetails,
    };
  }

  if (normalized.includes('managed storage funding requires an active pro subscription')) {
    return {
      title: 'Pro required for managed funding',
      description: 'Upgrade to Pro or top up this storage canister manually, then retry.',
      technicalDetails,
    };
  }

  if (normalized.includes('manual onchain funding required')) {
    return {
      title: 'Storage needs cycles',
      description: 'Top up this OnChain storage canister or upgrade to Pro for managed funding, then retry.',
      technicalDetails,
    };
  }

  if (normalized.includes('active pro subscription')) {
    return {
      title: 'Pro required for auto top-up',
      description: 'Upgrade to Pro or top up this storage canister manually, then retry.',
      technicalDetails,
    };
  }

  if (
    normalized.includes('[fundingpending]') ||
    normalized.includes('upload funding is pending') ||
    normalized.includes('storage funding is already in progress')
  ) {
    return {
      title: 'Storage top-up in progress',
      description: 'Keep this upload open while the storage canister receives cycles.',
      technicalDetails,
    };
  }

  if (
    normalized.includes('[insufficientcycles]') ||
    normalized.includes('insufficient storage canister cycles') ||
    normalized.includes('out of cycles')
  ) {
    return {
      title: 'Storage needs cycles',
      description: 'Top up this storage canister or enable auto top-up, then retry.',
      technicalDetails,
    };
  }

  return {
    title: 'Upload failed',
    description: technicalDetails ?? 'Try again or choose another file.',
    technicalDetails,
  };
}
