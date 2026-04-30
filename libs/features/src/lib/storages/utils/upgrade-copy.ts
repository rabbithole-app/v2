export type UpgradeCopyInput = {
  frontendUpdateAvailable?: boolean | null;
  wasmUpdateAvailable?: boolean | null;
};

export type UpgradeCopy = {
  completedDescription: string;
  progressDescription: string;
};

export function buildUpgradeCopy(input: UpgradeCopyInput): UpgradeCopy {
  const hasWasm = input.wasmUpdateAvailable === true;
  const hasFrontend = input.frontendUpdateAvailable === true;

  if (hasWasm && hasFrontend) {
    return {
      completedDescription: 'The storage module and interface updates completed successfully.',
      progressDescription: 'Track permissions, module install, interface upload, and controller cleanup.',
    };
  }

  if (hasWasm) {
    return {
      completedDescription: 'The storage module update completed successfully.',
      progressDescription: 'Track permissions, module install, and controller cleanup.',
    };
  }

  if (hasFrontend) {
    return {
      completedDescription: 'The interface update completed successfully.',
      progressDescription: 'Track permissions, interface upload, and controller cleanup.',
    };
  }

  return {
    completedDescription: 'The available updates completed successfully.',
    progressDescription: 'Track permissions, update progress, and controller cleanup.',
  };
}
