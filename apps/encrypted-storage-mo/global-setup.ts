import { PocketIcServer } from '@dfinity/pic';
import type { TestProject } from 'vitest/node';

let pic: PocketIcServer | undefined;

export async function setup({ provide }: TestProject): Promise<void> {
  pic = await PocketIcServer.start({
    showCanisterLogs: true,
  });
  const url = pic.getUrl();

  provide('PIC_URL', url);
}

export async function teardown(): Promise<void> {
  await pic?.stop();
}
