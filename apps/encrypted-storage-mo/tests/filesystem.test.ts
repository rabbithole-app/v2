import {
  type Actor,
  type CanisterFixture,
  createIdentity,
  PocketIc,
} from '@dfinity/pic';
import { IDL } from '@icp-sdk/core/candid';
import { Principal } from '@icp-sdk/core/principal';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, inject, test } from 'vitest';

// Import generated types for your canister
import {
  type _SERVICE,
  idlFactory,
  init,
} from '../declarations/encrypted-storage/encrypted-storage.did.js';

// Define the path to your canister's WASM file
export const WASM_PATH = resolve(
  import.meta.dirname,
  '..',
  '.dfx',
  'local',
  'canisters',
  'encrypted-storage',
  'encrypted-storage.wasm',
);

const ownerIdentity = createIdentity('owner');
const aliceIdentity = createIdentity('alice');
const bobIdentity = createIdentity('bob');
const charlieIdentity = createIdentity('charlie');
const danIdentity = createIdentity('dan');

const READ = { Read: null };
const READ_WRITE = { ReadWrite: null };
const READ_WRITE_MANAGE = { ReadWriteManage: null };
const DIRECTORY = { Directory: null };
const FILE = { File: null };

async function createPic(): Promise<[PocketIc, CanisterFixture<_SERVICE>]> {
  // create a new PocketIC instance
  const pic = await PocketIc.create(inject('PIC_URL'));

  // Setup the canister and actor
  const fixture = await pic.setupCanister<_SERVICE>({
    idlFactory,
    wasm: WASM_PATH,
    sender: ownerIdentity.getPrincipal(),
  });

  return [pic, fixture];
}

describe('FileSystem', () => {
  let pic: PocketIc;
  let canisterId: Principal;
  let actor: Actor<_SERVICE>;

  beforeEach(async () => {
    const [picInstance, fixture] = await createPic();
    pic = picInstance;
    // Force UTC to avoid TZ-dependent parsing differences (Docker usually runs in UTC)
    const date = new Date('2029-12-31T00:00:00Z');
    await pic.setCertifiedTime(date);

    // Save the actor and canister ID for use in tests
    actor = fixture.actor;
    canisterId = fixture.canisterId;
    actor.setIdentity(ownerIdentity);
  });

  afterEach(async () => {
    // tear down the PocketIC instance
    await pic?.tearDown();
  });

  describe('hasPermission', () => {
    test('Owner should have #ReadWriteManage', async () => {
      expect(
        await actor.hasPermission({
          entry: [],
          user: ownerIdentity.getPrincipal(),
          permission: READ_WRITE_MANAGE,
        }),
      ).toBeTruthy();
    });

    test('Owner should have #Write', async () => {
      expect(
        await actor.hasPermission({
          entry: [],
          user: ownerIdentity.getPrincipal(),
          permission: READ_WRITE,
        }),
      ).toBeTruthy();
    });

    test('Owner should have #Read', async () => {
      expect(
        await actor.hasPermission({
          entry: [],
          user: ownerIdentity.getPrincipal(),
          permission: READ,
        }),
      ).toBeTruthy();
    });

    test('Alice should not have #Read', async () => {
      expect(
        await actor.hasPermission({
          entry: [],
          user: aliceIdentity.getPrincipal(),
          permission: READ,
        }),
      ).toBeFalsy();
    });
  });

  describe('create', () => {
    test('should create entries', async () => {
      const result = await actor.create({
        entry: [DIRECTORY, 'Documents/Books/classic'],
        overwrite: false,
      });
      expect(result).toMatchObject({
        id: 1938810470400000002n,
        name: 'classic',
      });
      const result2 = await actor.create({
        entry: [DIRECTORY, 'Documents/Books/detective'],
        overwrite: false,
      });
      expect(result2).toMatchObject({ id: 1938810470400000003n });
      const result3 = await actor.create({
        entry: [FILE, 'Documents/Photos/1.jpg'],
        overwrite: false,
      });
      expect(result3).toMatchObject({ id: 1938810470400000005n });
    });

    test('should return err if entry exists', async () => {
      const result = await actor.create({
        entry: [DIRECTORY, 'Documents/Books/classic'],
        overwrite: false,
      });
      expect(result).toMatchObject({ id: 1938810470400000002n });
      await expect(
        actor.create({
          entry: [DIRECTORY, 'Documents/Books/classic'],
          overwrite: false,
        }),
      ).rejects.toThrowError();
    });
  });

  describe('delete', () => {
    test('should throw NotEmpty error with recursive false', async () => {
      const result = await actor.create({
        entry: [FILE, 'Documents/WP/bitcoin.pdf'],
        overwrite: false,
      });
      expect(result).toMatchObject({ id: 1938810470400000002n });
      await expect(
        actor.delete({
          entry: [DIRECTORY, 'Documents/WP'],
          recursive: false,
        }),
      ).rejects.toThrowError(
        'Canister call failed: Directory not empty: Documents/WP.',
      );
    });

    test('should throw NotFound error', async () => {
      await expect(
        actor.delete({
          entry: [FILE, 'Documents/Photos/not-found.jpg'],
          recursive: true,
        }),
      ).rejects.toThrowError(
        'Canister call failed: File not found: Documents/Photos/not-found.jpg.',
      );
    });

    test('should delete entries', async () => {
      // create entries
      const result = await actor.create({
        entry: [FILE, 'Documents/WP/bitcoin.pdf'],
        overwrite: false,
      });
      expect(result).toMatchObject({ id: 1938810470400000002n });
      const result2 = await actor.create({
        entry: [FILE, 'Private/wallet.dat'],
        overwrite: false,
      });
      expect(result2).toMatchObject({ id: 1938810470400000004n });

      // delete directory
      const result3 = await actor.delete({
        entry: [DIRECTORY, 'Documents'],
        recursive: true,
      });
      expect(result3).toBeNull();

      // delete asset
      const result4 = await actor.delete({
        entry: [FILE, 'Private/wallet.dat'],
        recursive: false,
      });
      expect(result4).toBeNull();
    });
  });

  describe('move', () => {
    beforeEach(async () => {
      await actor.create({
        entry: [FILE, 'Photos/1.jpg'],
        overwrite: false,
      });
      await actor.create({
        entry: [FILE, 'Photos/2.jpg'],
        overwrite: false,
      });
      await actor.create({
        entry: [FILE, 'Photos/Turkey/2.jpg'],
        overwrite: false,
      });
      await actor.create({
        entry: [FILE, 'Photos/Turkey/3.jpg'],
        overwrite: false,
      });
      await actor.create({
        entry: [FILE, 'Shared/Photos/Turkey/1.jpg'],
        overwrite: false,
      });
      await actor.create({
        entry: [FILE, 'Shared/Photos/Turkey/2.jpg'],
        overwrite: false,
      });
      await actor.create({
        entry: [FILE, 'Shared/Photos/2.jpg'],
        overwrite: false,
      });
      await actor.create({
        entry: [FILE, 'Shared/Photos/3.jpg'],
        overwrite: false,
      });
    });

    test('should move files', async () => {
      const result = await actor.move({
        entry: [DIRECTORY, 'Photos'],
        target: [[DIRECTORY, 'Shared']],
      });
      expect(result).toBeNull();
      const treeContent = await actor.showTree([]);
      expect(treeContent).toEqual(
        '\n .\n\
░└─Shared[5fo2nqhz2222g]\n\
░░░└─Photos[5fo2nqhz2222i]\n\
░░░░░├─Turkey[5fo2nqhz2222k]\n\
░░░░░│░├─1.jpg[5fo2nqhz2222m]\n\
░░░░░│░├─2.jpg[5fo2nqhz2222o]\n\
░░░░░│░└─3.jpg[5fo2nqhz2222e]\n\
░░░░░├─1.jpg[5fo2nqhz22224]\n\
░░░░░├─2.jpg[5fo2nqhz2222q]\n\
░░░░░└─3.jpg[5fo2nqhz2222s]\n',
      );
    });

    test('should merge access rights', async () => {
      const before: Parameters<typeof actor.grantPermission>[] = [
        [
          {
            entry: [[DIRECTORY, 'Photos']],
            user: aliceIdentity.getPrincipal(),
            permission: READ_WRITE,
          },
        ],
        [
          {
            entry: [[DIRECTORY, 'Shared/Photos']],
            user: aliceIdentity.getPrincipal(),
            permission: READ,
          },
        ],
        [
          {
            entry: [[DIRECTORY, 'Shared/Photos']],
            user: bobIdentity.getPrincipal(),
            permission: READ_WRITE,
          },
        ],
        [
          {
            entry: [[FILE, 'Photos/2.jpg']],
            user: aliceIdentity.getPrincipal(),
            permission: READ_WRITE_MANAGE,
          },
        ],
        [
          {
            entry: [[FILE, 'Shared/Photos/2.jpg']],
            user: bobIdentity.getPrincipal(),
            permission: READ_WRITE,
          },
        ],
      ];
      for (const args of before) {
        await actor.grantPermission(...args);
        expect(await actor.hasPermission(...args)).toBeTruthy();
      }

      const result = await actor.move({
        entry: [DIRECTORY, 'Photos'],
        target: [[DIRECTORY, 'Shared']],
      });
      expect(result).toBeNull();
      expect(
        await actor.hasPermission({
          entry: [[DIRECTORY, 'Shared/Photos']],
          user: aliceIdentity.getPrincipal(),
          permission: READ,
        }),
      ).toBeTruthy();
      expect(
        await actor.hasPermission({
          entry: [[DIRECTORY, 'Shared/Photos']],
          user: aliceIdentity.getPrincipal(),
          permission: READ_WRITE,
        }),
      ).toBeFalsy();
      expect(
        await actor.hasPermission({
          entry: [[DIRECTORY, 'Shared/Photos']],
          user: bobIdentity.getPrincipal(),
          permission: READ_WRITE,
        }),
      ).toBeTruthy();
      expect(
        await actor.hasPermission({
          entry: [[FILE, 'Shared/Photos/2.jpg']],
          user: aliceIdentity.getPrincipal(),
          permission: READ_WRITE_MANAGE,
        }),
      ).toBeTruthy();
      expect(
        await actor.hasPermission({
          entry: [[FILE, 'Shared/Photos/2.jpg']],
          user: bobIdentity.getPrincipal(),
          permission: READ_WRITE,
        }),
      ).toBeTruthy();
    });
  });

  describe('grantPermission', () => {
    beforeEach(async () => {
      await actor.create({
        entry: [FILE, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]/bitcoin.pdf'],
        overwrite: false,
      });
      await actor.create({
        entry: [DIRECTORY, 'Shared/with-alice[rw]-anyone[r]'],
        overwrite: false,
      });
      await actor.create({
        entry: [FILE, 'Private/wallet.dat'],
        overwrite: false,
      });
      await actor.grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]']],
        user: aliceIdentity.getPrincipal(),
        permission: READ_WRITE,
      });
      await actor.grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]']],
        user: bobIdentity.getPrincipal(),
        permission: READ,
      });
      await actor.grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]']],
        user: charlieIdentity.getPrincipal(),
        permission: READ_WRITE_MANAGE,
      });
      await actor.grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-anyone[r]']],
        user: aliceIdentity.getPrincipal(),
        permission: READ_WRITE,
      });
      await actor.grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-anyone[r]']],
        user: Principal.anonymous(),
        permission: READ,
      });
    });

    describe('Alice', () => {
      beforeEach(() => {
        actor.setPrincipal(ownerIdentity.getPrincipal());
      });

      test('should have #ReadWrite permissions', async () => {
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]']],
            user: aliceIdentity.getPrincipal(),
            permission: READ,
          }),
        ).toBeTruthy();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]']],
            user: aliceIdentity.getPrincipal(),
            permission: READ_WRITE,
          }),
        ).toBeTruthy();
        expect(
          await actor.hasPermission({
            entry: [
              [FILE, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]/bitcoin.pdf'],
            ],
            user: aliceIdentity.getPrincipal(),
            permission: READ,
          }),
        ).toBeTruthy();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-anyone[r]']],
            user: aliceIdentity.getPrincipal(),
            permission: READ,
          }),
        ).toBeTruthy();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-anyone[r]']],
            user: aliceIdentity.getPrincipal(),
            permission: READ_WRITE,
          }),
        ).toBeTruthy();
      });

      test('should not have #ReadWriteManage permission', async () => {
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]']],
            user: aliceIdentity.getPrincipal(),
            permission: READ_WRITE_MANAGE,
          }),
        ).toBeFalsy();
        // expect(
        //   await actor.hasPermission(
        //     [{ Directory: "Shared/with-alice[rw]-bob[r]-charlie[rwm]" }],
        //     {
        //       Admin: null,
        //     }
        //   )
        // ).toBeFalsy();
      });

      test('should not have #Read for Private', async () => {
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Private']],
            user: aliceIdentity.getPrincipal(),
            permission: READ,
          }),
        ).toBeFalsy();
        expect(
          await actor.hasPermission({
            entry: [[FILE, 'Private/wallet.dat']],
            user: aliceIdentity.getPrincipal(),
            permission: READ,
          }),
        ).toBeFalsy();
      });
    });

    describe('Bob', () => {
      beforeEach(() => {
        actor.setPrincipal(ownerIdentity.getPrincipal());
      });

      test('should have #Read permission', async () => {
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]']],
            user: bobIdentity.getPrincipal(),
            permission: READ,
          }),
        ).toBeTruthy();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]']],
            user: bobIdentity.getPrincipal(),
            permission: READ_WRITE,
          }),
        ).toBeFalsy();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]']],
            user: bobIdentity.getPrincipal(),
            permission: READ_WRITE_MANAGE,
          }),
        ).toBeFalsy();
      });

      test('should have #Read permission for public entry', async () => {
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-anyone[r]']],
            user: bobIdentity.getPrincipal(),
            permission: READ,
          }),
        ).toBeTruthy();
      });
    });

    describe('Charlie', () => {
      beforeEach(() => {
        actor.setPrincipal(charlieIdentity.getPrincipal());
      });

      test('should have #ReadWriteManage permission', async () => {
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]']],
            user: charlieIdentity.getPrincipal(),
            permission: READ,
          }),
        ).toBeTruthy();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]']],
            user: charlieIdentity.getPrincipal(),
            permission: READ_WRITE,
          }),
        ).toBeTruthy();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]']],
            user: charlieIdentity.getPrincipal(),
            permission: READ_WRITE_MANAGE,
          }),
        ).toBeTruthy();
      });

      test('should grant permission lower then #Admin', async () => {
        // add #Read permission
        const result = await actor.grantPermission({
          entry: [
            [FILE, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]/bitcoin.pdf'],
          ],
          user: danIdentity.getPrincipal(),
          permission: READ,
        });
        expect(result).toBeNull();
        //   actor.setPrincipal(danIdentity.getPrincipal());
        expect(
          await actor.hasPermission({
            entry: [
              [FILE, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]/bitcoin.pdf'],
            ],
            user: danIdentity.getPrincipal(),
            permission: READ,
          }),
        ).toBeTruthy();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]']],
            user: danIdentity.getPrincipal(),
            permission: READ,
          }),
        ).toBeFalsy();

        // add #Write permission
        //   actor.setPrincipal(charlieIdentity.getPrincipal());
        const result2 = await actor.grantPermission({
          entry: [
            [FILE, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]/bitcoin.pdf'],
          ],
          user: danIdentity.getPrincipal(),
          permission: READ_WRITE,
        });
        expect(result2).toBeNull();
        //   actor.setPrincipal(danIdentity.getPrincipal());
        expect(
          await actor.hasPermission({
            entry: [
              [FILE, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]/bitcoin.pdf'],
            ],
            user: danIdentity.getPrincipal(),
            permission: READ_WRITE,
          }),
        ).toBeTruthy();

        const result3 = await actor.grantPermission({
          entry: [
            [FILE, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]/bitcoin.pdf'],
          ],
          user: danIdentity.getPrincipal(),
          permission: READ_WRITE_MANAGE,
        });
        expect(result3).toBeNull();
        expect(
          await actor.hasPermission({
            entry: [
              [FILE, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]/bitcoin.pdf'],
            ],
            user: danIdentity.getPrincipal(),
            permission: READ_WRITE_MANAGE,
          }),
        ).toBeTruthy();
      });
    });

    describe('anonymous', () => {
      beforeEach(() => {
        // actor.setPrincipal(Principal.anonymous());
      });

      test('should have #Read permission', async () => {
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-anyone[r]']],
            user: Principal.anonymous(),
            permission: READ,
          }),
        ).toBeTruthy();
      });
    });
  });

  describe('revokePermission', () => {
    beforeEach(async () => {
      await actor.create({
        entry: [DIRECTORY, 'Shared/with-alice[rw]-anyone[r]'],
        overwrite: false,
      });
      await actor.grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-anyone[r]']],
        user: aliceIdentity.getPrincipal(),
        permission: READ_WRITE,
      });
      await actor.grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-anyone[r]']],
        user: Principal.anonymous(),
        permission: READ,
      });
    });

    describe('Alice', () => {
      test('should not have #ReadWrite permission', async () => {
        const result = await actor.revokePermission({
          entry: [[DIRECTORY, 'Shared/with-alice[rw]-anyone[r]']],
          user: aliceIdentity.getPrincipal(),
        });
        expect(result).toBeNull();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-anyone[r]']],
            user: aliceIdentity.getPrincipal(),
            permission: READ_WRITE,
          }),
        ).toBeFalsy();
      });
    });

    describe('anonymous', () => {
      test('should not have #Read permission', async () => {
        const result = await actor.revokePermission({
          entry: [[DIRECTORY, 'Shared/with-alice[rw]-anyone[r]']],
          user: Principal.anonymous(),
        });
        expect(result).toBeNull();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-anyone[r]']],
            user: Principal.anonymous(),
            permission: READ,
          }),
        ).toBeFalsy();
      });
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await actor.create({
        entry: [DIRECTORY, 'Shared/with-alice[rw]-bob[r]'],
        overwrite: false,
      });
      await actor.create({
        entry: [DIRECTORY, 'Shared/with-charlie[rwm]'],
        overwrite: false,
      });
      await actor.grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]']],
        user: aliceIdentity.getPrincipal(),
        permission: READ_WRITE,
      });
      await actor.grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]']],
        user: bobIdentity.getPrincipal(),
        permission: READ,
      });
      await actor.grantPermission({
        entry: [[DIRECTORY, 'Shared/with-charlie[rwm]']],
        user: charlieIdentity.getPrincipal(),
        permission: READ_WRITE_MANAGE,
      });
    });

    describe('Alice', () => {
      beforeEach(() => {
        actor.setIdentity(aliceIdentity);
      });

      test('list([]) should show Shared', async () => {
        const list = await actor.list([]);
        expect(list.map((n) => n.name)).toEqual(['Shared']);
        const [root] = list;
        expect(root).toBeTruthy();
        if (!root) throw new Error('Expected root entry to exist');
        expect('Directory' in root.metadata).toBeTruthy();
      });

      test('list(Shared) should show only permitted shares', async () => {
        const list = await actor.list([[DIRECTORY, 'Shared']]);
        expect(list.map((n) => n.name)).toEqual(['with-alice[rw]-bob[r]']);
      });
    });

    describe('Bob', () => {
      beforeEach(() => {
        actor.setIdentity(bobIdentity);
      });

      test('list([]) should show Shared', async () => {
        const list = await actor.list([]);
        expect(list.map((n) => n.name)).toEqual(['Shared']);
        const [root] = list;
        expect(root).toBeTruthy();
        if (!root) throw new Error('Expected root entry to exist');
        expect('Directory' in root.metadata).toBeTruthy();
      });

      test('list(Shared) should show only permitted shares', async () => {
        const list = await actor.list([[DIRECTORY, 'Shared']]);
        expect(list.map((n) => n.name)).toEqual(['with-alice[rw]-bob[r]']);
      });
    });

    describe('Dan', () => {
      beforeEach(() => {
        actor.setIdentity(danIdentity);
      });

      test('list([]) should be empty (no shares)', async () => {
        const list = await actor.list([]);
        expect(list).toEqual([]);
      });
    });
  });

  describe('with owner', () => {
    describe('grantPermission (3 users)', async () => {
      beforeEach(async () => {
        await actor.create({
          entry: [DIRECTORY, 'Shared/with-alice[rw]/photos'],
          overwrite: false,
        });
        await actor.create({
          entry: [DIRECTORY, 'Shared/with-alice[rw]-and-bob[r]/documents'],
          overwrite: false,
        });
        await actor.create({
          entry: [FILE, 'Private/wallet.dat'],
          overwrite: false,
        });
        await actor.grantPermission({
          entry: [[DIRECTORY, 'Shared/with-alice[rw]']],
          user: aliceIdentity.getPrincipal(),
          permission: READ_WRITE,
        });
        await actor.grantPermission({
          entry: [[DIRECTORY, 'Shared/with-alice[rw]-and-bob[r]']],
          user: aliceIdentity.getPrincipal(),
          permission: READ_WRITE,
        });
        await actor.grantPermission({
          entry: [[DIRECTORY, 'Shared/with-alice[rw]-and-bob[r]']],
          user: bobIdentity.getPrincipal(),
          permission: READ,
        });

        // actor.setIdentity(aliceIdentity);
      });

      test('Alice should have permissions #Read and #ReadWrite', async () => {
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]']],
            user: aliceIdentity.getPrincipal(),
            permission: READ,
          }),
        ).toBeTruthy();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]']],
            user: aliceIdentity.getPrincipal(),
            permission: READ_WRITE,
          }),
        ).toBeTruthy();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]']],
            user: aliceIdentity.getPrincipal(),
            permission: READ_WRITE_MANAGE,
          }),
        ).toBeFalsy();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-and-bob[r]']],
            user: aliceIdentity.getPrincipal(),
            permission: READ,
          }),
        ).toBeTruthy();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-and-bob[r]']],
            user: aliceIdentity.getPrincipal(),
            permission: READ_WRITE,
          }),
        ).toBeTruthy();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-and-bob[r]']],
            user: aliceIdentity.getPrincipal(),
            permission: READ_WRITE_MANAGE,
          }),
        ).toBeFalsy();
        // expect(
        //   await actor.hasPermission(
        //     [{ Directory: "Shared/with-alice[rw]-and-bob[r]" }],
        //     {
        //       Admin: null,
        //     },
        //   ),
        // ).toBeFalsy();
      });

      test('Bob should have permission #Read', async () => {
        // actor.setPrincipal(bobIdentity.getPrincipal());
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-and-bob[r]']],
            user: bobIdentity.getPrincipal(),
            permission: READ,
          }),
        ).toBeTruthy();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-and-bob[r]']],
            user: bobIdentity.getPrincipal(),
            permission: READ_WRITE,
          }),
        ).toBeFalsy();
        expect(
          await actor.hasPermission({
            entry: [[DIRECTORY, 'Shared/with-alice[rw]-and-bob[r]']],
            user: bobIdentity.getPrincipal(),
            permission: READ_WRITE_MANAGE,
          }),
        ).toBeFalsy();
      });
    });
  });

  test('should reinstall the canister', async () => {
    await actor.create({
      entry: [DIRECTORY, 'test/dir/sub'],
      overwrite: false,
    });
    const preReinstallTree = await actor.showTree([]);

    await pic.reinstallCode({
      canisterId,
      wasm: WASM_PATH,
      arg: IDL.encode(init({ IDL }), []),
      sender: ownerIdentity.getPrincipal(),
    });
    const postReinstallTree = await actor.showTree([]);

    expect(postReinstallTree).not.toEqual(preReinstallTree);
  });
});
