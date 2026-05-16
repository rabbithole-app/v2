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

export const WASM_PATH = resolve(
  import.meta.dirname,
  '..',
  '.icp',
  'cache',
  'artifacts',
  'encrypted-storage',
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
const CREATE_NEW = { CreateNew: null };
const GET_OR_CREATE = { GetOrCreate: null };

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

  async function grantPermission(args: {
    entry: Parameters<_SERVICE['hasPermission']>[0]['entry'];
    permission: Parameters<_SERVICE['hasPermission']>[0]['permission'];
    user: Principal;
  }): Promise<null> {
    await actor.createAccessBatch({
      items: [
        {
          ref: { principal: args.user },
          accessClass: { ordinary: null },
          scope:
            args.entry.length > 0 ? { entry: args.entry[0] } : { root: null },
          permission: args.permission,
          source: { directGrant: null },
          expiresAt: [],
        },
      ],
    });
    return null;
  }

  async function revokePermission(args: {
    entry: Parameters<_SERVICE['hasPermission']>[0]['entry'];
    user: Principal;
  }): Promise<null> {
    await actor.revokeAccessBatch({
      items: [
        {
          principal: args.user,
          scope:
            args.entry.length > 0 ? { entry: args.entry[0] } : { root: null },
        },
      ],
    });
    return null;
  }

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
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      expect(result).toMatchObject({
        id: 1938810470400000002n,
        name: 'classic',
      });
      const result2 = await actor.create({
        entry: [DIRECTORY, 'Documents/Books/detective'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      expect(result2).toMatchObject({ id: 1938810470400000003n });
      const result3 = await actor.create({
        entry: [FILE, 'Documents/Photos/1.jpg'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      expect(result3).toMatchObject({ id: 1938810470400000005n });
    });

    test('should return err if entry exists', async () => {
      const result = await actor.create({
        entry: [DIRECTORY, 'Documents/Books/classic'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      expect(result).toMatchObject({ id: 1938810470400000002n });
      await expect(
        actor.create({
          entry: [DIRECTORY, 'Documents/Books/classic'],
          createMode: CREATE_NEW,
          encryptionMode: [],
        }),
      ).rejects.toThrowError();
    });
  });

  describe('delete', () => {
    test('should throw NotEmpty error with recursive false', async () => {
      const result = await actor.create({
        entry: [FILE, 'Documents/WP/bitcoin.pdf'],
        createMode: CREATE_NEW,
        encryptionMode: [],
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
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      expect(result).toMatchObject({ id: 1938810470400000002n });
      const result2 = await actor.create({
        entry: [FILE, 'Private/wallet.dat'],
        createMode: CREATE_NEW,
        encryptionMode: [],
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
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await actor.create({
        entry: [FILE, 'Photos/2.jpg'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await actor.create({
        entry: [FILE, 'Photos/Turkey/2.jpg'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await actor.create({
        entry: [FILE, 'Photos/Turkey/3.jpg'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await actor.create({
        entry: [FILE, 'Shared/Photos/Turkey/1.jpg'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await actor.create({
        entry: [FILE, 'Shared/Photos/Turkey/2.jpg'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await actor.create({
        entry: [FILE, 'Shared/Photos/2.jpg'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await actor.create({
        entry: [FILE, 'Shared/Photos/3.jpg'],
        createMode: CREATE_NEW,
        encryptionMode: [],
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
      const before: Parameters<typeof grantPermission>[] = [
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
        await grantPermission(...args);
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

    test('should not lose node when moving to current parent', async () => {
      const treeBefore = await actor.showTree([]);
      const result = await actor.move({
        entry: [DIRECTORY, 'Photos/Turkey'],
        target: [[DIRECTORY, 'Photos']],
      });
      expect(result).toBeNull();
      const treeAfter = await actor.showTree([]);
      expect(treeAfter).toEqual(treeBefore);
    });

    test('should not lose node when moving root dir to root', async () => {
      const treeBefore = await actor.showTree([]);
      const result = await actor.move({
        entry: [DIRECTORY, 'Photos'],
        target: [],
      });
      expect(result).toBeNull();
      const treeAfter = await actor.showTree([]);
      expect(treeAfter).toEqual(treeBefore);
    });

    test('should reject moving directory into itself', async () => {
      await expect(
        actor.move({
          entry: [DIRECTORY, 'Photos'],
          target: [[DIRECTORY, 'Photos']],
        }),
      ).rejects.toThrow();
      const treeAfter = await actor.showTree([]);
      expect(treeAfter).toContain('Photos');
    });

    test('should reject moving directory into its subdirectory', async () => {
      await expect(
        actor.move({
          entry: [DIRECTORY, 'Photos'],
          target: [[DIRECTORY, 'Photos/Turkey']],
        }),
      ).rejects.toThrow();
      const treeAfter = await actor.showTree([]);
      expect(treeAfter).toContain('Photos');
      expect(treeAfter).toContain('Turkey');
    });
  });

  describe('rename', () => {
    beforeEach(async () => {
      await actor.create({
        entry: [FILE, 'Documents/report.pdf'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await actor.create({
        entry: [FILE, 'Documents/notes.txt'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await actor.create({
        entry: [DIRECTORY, 'Photos'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
    });

    test('should rename a file', async () => {
      await actor.rename({
        entry: [FILE, 'Documents/report.pdf'],
        newName: 'renamed.pdf',
      });
      const tree = await actor.showTree([]);
      expect(tree).toContain('renamed.pdf');
      expect(tree).not.toContain('report.pdf');
    });

    test('should rename a directory', async () => {
      await actor.rename({
        entry: [DIRECTORY, 'Photos'],
        newName: 'Images',
      });
      const tree = await actor.showTree([]);
      expect(tree).toContain('Images');
      expect(tree).not.toContain('Photos');
    });

    test('should fail if new name already exists', async () => {
      await expect(
        actor.rename({
          entry: [FILE, 'Documents/report.pdf'],
          newName: 'notes.txt',
        }),
      ).rejects.toThrow('already exists');
    });

    test('should fail if entry does not exist', async () => {
      await expect(
        actor.rename({
          entry: [FILE, 'Documents/nonexistent.pdf'],
          newName: 'new-name.pdf',
        }),
      ).rejects.toThrow();
    });

    test('should preserve file access after rename', async () => {
      await grantPermission({
        entry: [[FILE, 'Documents/report.pdf']],
        user: aliceIdentity.getPrincipal(),
        permission: READ,
      });

      await actor.rename({
        entry: [FILE, 'Documents/report.pdf'],
        newName: 'renamed.pdf',
      });

      actor.setIdentity(aliceIdentity);
      const { entries: list } = await actor.list([[DIRECTORY, 'Documents']]);
      const names = list.map((n) => n.name);
      expect(names).toContain('renamed.pdf');
    });
  });

  describe('createAccessBatch', () => {
    beforeEach(async () => {
      await actor.create({
        entry: [FILE, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]/bitcoin.pdf'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await actor.create({
        entry: [DIRECTORY, 'Shared/with-alice[rw]-anyone[r]'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await actor.create({
        entry: [FILE, 'Private/wallet.dat'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]']],
        user: aliceIdentity.getPrincipal(),
        permission: READ_WRITE,
      });
      await grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]']],
        user: bobIdentity.getPrincipal(),
        permission: READ,
      });
      await grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]-charlie[rwm]']],
        user: charlieIdentity.getPrincipal(),
        permission: READ_WRITE_MANAGE,
      });
      await grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-anyone[r]']],
        user: aliceIdentity.getPrincipal(),
        permission: READ_WRITE,
      });
      await grantPermission({
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

      test('should create access batch permission lower then #Admin', async () => {
        // add #Read permission
        const result = await grantPermission({
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
        const result2 = await grantPermission({
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

        const result3 = await grantPermission({
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

  describe('revokeAccessBatch', () => {
    beforeEach(async () => {
      await actor.create({
        entry: [DIRECTORY, 'Shared/with-alice[rw]-anyone[r]'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-anyone[r]']],
        user: aliceIdentity.getPrincipal(),
        permission: READ_WRITE,
      });
      await grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-anyone[r]']],
        user: Principal.anonymous(),
        permission: READ,
      });
    });

    describe('Alice', () => {
      test('should not have #ReadWrite permission', async () => {
        const result = await revokePermission({
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
        const result = await revokePermission({
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
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await actor.create({
        entry: [DIRECTORY, 'Shared/with-charlie[rwm]'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]']],
        user: aliceIdentity.getPrincipal(),
        permission: READ_WRITE,
      });
      await grantPermission({
        entry: [[DIRECTORY, 'Shared/with-alice[rw]-bob[r]']],
        user: bobIdentity.getPrincipal(),
        permission: READ,
      });
      await grantPermission({
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
        const { entries: list } = await actor.list([]);
        expect(list.map((n) => n.name)).toEqual(['Shared']);
        const [root] = list;
        expect(root).toBeTruthy();
        if (!root) throw new Error('Expected root entry to exist');
        expect('Directory' in root.metadata).toBeTruthy();
      });

      test('list(Shared) should show only permitted shares', async () => {
        const { entries: list } = await actor.list([[DIRECTORY, 'Shared']]);
        expect(list.map((n) => n.name)).toEqual(['with-alice[rw]-bob[r]']);
      });
    });

    describe('Bob', () => {
      beforeEach(() => {
        actor.setIdentity(bobIdentity);
      });

      test('list([]) should show Shared', async () => {
        const { entries: list } = await actor.list([]);
        expect(list.map((n) => n.name)).toEqual(['Shared']);
        const [root] = list;
        expect(root).toBeTruthy();
        if (!root) throw new Error('Expected root entry to exist');
        expect('Directory' in root.metadata).toBeTruthy();
      });

      test('list(Shared) should show only permitted shares', async () => {
        const { entries: list } = await actor.list([[DIRECTORY, 'Shared']]);
        expect(list.map((n) => n.name)).toEqual(['with-alice[rw]-bob[r]']);
      });
    });

    describe('Dan', () => {
      beforeEach(() => {
        actor.setIdentity(danIdentity);
      });

      test('list([]) should be empty (no shares)', async () => {
        const { entries } = await actor.list([]);
        expect(entries).toEqual([]);
      });
    });

    describe('callerPermission and directoryPermission', () => {
      // --- Owner ---
      test('owner: directoryPermission is ReadWriteManage on root', async () => {
        const { directoryPermission } = await actor.list([]);
        expect(directoryPermission).toEqual([READ_WRITE_MANAGE]);
      });

      test('owner: callerPermission is ReadWriteManage on all root entries', async () => {
        const { entries } = await actor.list([]);
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
          expect(entry.callerPermission).toEqual([READ_WRITE_MANAGE]);
        }
      });

      test('owner: directoryPermission is ReadWriteManage on subdirectory', async () => {
        const { directoryPermission } = await actor.list([
          [DIRECTORY, 'Shared'],
        ]);
        expect(directoryPermission).toEqual([READ_WRITE_MANAGE]);
      });

      // --- Alice (ReadWrite on with-alice[rw]-bob[r]) ---
      test('Alice: directoryPermission is null on root (no root access)', async () => {
        actor.setIdentity(aliceIdentity);
        const { directoryPermission } = await actor.list([]);
        expect(directoryPermission).toEqual([]);
      });

      test('Alice: callerPermission on reachable root Shared reflects actual permission', async () => {
        actor.setIdentity(aliceIdentity);
        const { entries } = await actor.list([]);
        expect(entries.map((n) => n.name)).toEqual(['Shared']);
        // Alice has no direct permission on Shared, but can see it as a path to her shares
        // callerPermission reflects the effective permission on the Shared directory itself
        for (const entry of entries) {
          expect(entry.callerPermission).toBeTruthy();
        }
      });

      test('Alice: directoryPermission on Shared directory', async () => {
        actor.setIdentity(aliceIdentity);
        const { directoryPermission } = await actor.list([
          [DIRECTORY, 'Shared'],
        ]);
        // Alice doesn't have direct permission on Shared, inherited from child access
        expect(directoryPermission).toBeTruthy();
      });

      test('Alice: callerPermission is ReadWrite on her shared entries', async () => {
        actor.setIdentity(aliceIdentity);
        const { entries } = await actor.list([[DIRECTORY, 'Shared']]);
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
          expect(entry.callerPermission).toEqual([READ_WRITE]);
        }
      });

      // --- Bob (Read on with-alice[rw]-bob[r]) ---
      test('Bob: callerPermission is Read on his shared directory', async () => {
        actor.setIdentity(bobIdentity);
        const { entries } = await actor.list([[DIRECTORY, 'Shared']]);
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
          expect(entry.callerPermission).toEqual([READ]);
        }
      });

      // --- Charlie (ReadWriteManage on with-charlie[rwm]) ---
      test('Charlie: callerPermission is ReadWriteManage on his managed directory', async () => {
        actor.setIdentity(charlieIdentity);
        const { entries } = await actor.list([[DIRECTORY, 'Shared']]);
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
          expect(entry.callerPermission).toEqual([READ_WRITE_MANAGE]);
        }
      });

      // --- Dan (no access) ---
      test('Dan: directoryPermission is null on root', async () => {
        actor.setIdentity(danIdentity);
        const { directoryPermission } = await actor.list([]);
        expect(directoryPermission).toEqual([]);
      });

      test('Dan: entries are empty', async () => {
        actor.setIdentity(danIdentity);
        const { entries } = await actor.list([]);
        expect(entries).toEqual([]);
      });

      // --- Mixed permissions (child overrides) ---
      test('owner: children with different user permissions still return ReadWriteManage for owner', async () => {
        // Shared has two children with different grants for alice/bob/charlie
        // But owner should see ReadWriteManage on all
        const { entries } = await actor.list([[DIRECTORY, 'Shared']]);
        expect(entries.length).toBe(2);
        for (const entry of entries) {
          expect(entry.callerPermission).toEqual([READ_WRITE_MANAGE]);
        }
      });

      // --- Sharing info ---
      test('owner: shared directories have sharing info', async () => {
        // Shared/with-alice[rw]-bob[r] has alice(RW) + bob(R) = 2 permissions
        // Shared/with-charlie[rwm] has charlie(RWM) = 1 permission
        const { entries } = await actor.list([[DIRECTORY, 'Shared']]);
        expect(entries.length).toBe(2);
        const withAliceBob = entries.find(
          (e) => e.name === 'with-alice[rw]-bob[r]',
        );
        const withCharlie = entries.find((e) => e.name === 'with-charlie[rwm]');
        expect(withAliceBob).toBeTruthy();
        expect(withCharlie).toBeTruthy();
        expect(withAliceBob!.sharing).toEqual([{ sharedWith: 2n }]);
        expect(withCharlie!.sharing).toEqual([{ sharedWith: 1n }]);
      });

      test('owner: non-shared directories have no sharing info', async () => {
        // Root-level "Shared" directory itself has no direct permissions
        const { entries } = await actor.list([]);
        const sharedDir = entries.find((e) => e.name === 'Shared');
        expect(sharedDir).toBeTruthy();
        expect(sharedDir!.sharing).toEqual([]);
      });

      test('Alice: sharing info is null (not manager)', async () => {
        actor.setIdentity(aliceIdentity);
        const { entries } = await actor.list([[DIRECTORY, 'Shared']]);
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
          expect(entry.sharing).toEqual([]);
        }
      });

      // --- callerPermission null for non-list methods ---
      test('create returns NodeDetails with callerPermission null', async () => {
        const node = await actor.create({
          entry: [DIRECTORY, 'TestDir'],
          createMode: CREATE_NEW,
          encryptionMode: [],
        });
        expect(node.callerPermission).toEqual([]);
      });
    });

    describe('fsTree (permission-aware)', () => {
      test('owner: returns full directory tree', async () => {
        const tree = await actor.fsTree();
        // Owner should see all directories: Shared, Shared/with-alice[rw]-bob[r], Shared/with-charlie[rwm]
        const names = tree.map((n) => n.name);
        expect(names).toContain('Shared');
      });

      test('Alice: returns only writable roots with subtrees', async () => {
        actor.setIdentity(aliceIdentity);
        const tree = await actor.fsTree();
        // Alice has ReadWrite on Shared/with-alice[rw]-bob[r]
        expect(tree.length).toBe(1);
        expect(tree[0].name).toBe('Shared/with-alice[rw]-bob[r]');
      });

      test('Bob: returns empty (Read-only, no writable dirs)', async () => {
        actor.setIdentity(bobIdentity);
        const tree = await actor.fsTree();
        // Bob has only Read on Shared/with-alice[rw]-bob[r], no Write anywhere
        expect(tree).toEqual([]);
      });

      test('Charlie: returns writable root with subtree', async () => {
        actor.setIdentity(charlieIdentity);
        const tree = await actor.fsTree();
        // Charlie has ReadWriteManage on Shared/with-charlie[rwm]
        expect(tree.length).toBe(1);
        expect(tree[0].name).toBe('Shared/with-charlie[rwm]');
      });

      test('Dan: returns empty (no access)', async () => {
        actor.setIdentity(danIdentity);
        const tree = await actor.fsTree();
        expect(tree).toEqual([]);
      });
    });
  });

  describe('deep nested permission (3rd level)', () => {
    beforeEach(async () => {
      await actor.create({
        entry: [DIRECTORY, 'test/dir/subdir'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await grantPermission({
        entry: [[DIRECTORY, 'test/dir/subdir']],
        user: aliceIdentity.getPrincipal(),
        permission: READ_WRITE,
      });
    });

    test('Alice: list([]) shows "test" as reachable root', async () => {
      actor.setIdentity(aliceIdentity);
      const { entries } = await actor.list([]);
      expect(entries.map((n) => n.name)).toContain('test');
    });

    test('Alice: list(test) shows "dir" as intermediate directory', async () => {
      actor.setIdentity(aliceIdentity);
      const { entries } = await actor.list([[DIRECTORY, 'test']]);
      expect(entries.map((n) => n.name)).toContain('dir');
    });

    test('Alice: list(test/dir) shows "subdir"', async () => {
      actor.setIdentity(aliceIdentity);
      const { entries } = await actor.list([[DIRECTORY, 'test/dir']]);
      expect(entries.map((n) => n.name)).toContain('subdir');
    });

    test('Alice: callerPermission on subdir is ReadWrite', async () => {
      actor.setIdentity(aliceIdentity);
      const { entries } = await actor.list([[DIRECTORY, 'test/dir']]);
      const subdir = entries.find((e) => e.name === 'subdir');
      expect(subdir).toBeTruthy();
      expect(subdir!.callerPermission).toEqual([READ_WRITE]);
    });
  });

  describe('with owner', () => {
    describe('listAccessGrants', () => {
      beforeEach(async () => {
        await actor.create({
          entry: [DIRECTORY, 'Shared/photos'],
          createMode: CREATE_NEW,
          encryptionMode: [],
        });
      });

      test('returns pending email grants with display email', async () => {
        const emailCommitment = new Uint8Array([1, 2, 3, 4]);

        await actor.createAccessBatch({
          items: [
            {
              ref: {
                email: {
                  email: 'editor@example.com',
                  emailCommitment,
                },
              },
              accessClass: { ordinary: null },
              scope: { entry: [DIRECTORY, 'Shared'] },
              permission: READ,
              source: { directGrant: null },
              expiresAt: [],
            },
          ],
        });

        const result = await actor.listAccessGrants({
          scope: [{ entry: [DIRECTORY, 'Shared'] }],
          mode: { exact: null },
        });

        expect(result.pendingGrants).toHaveLength(1);
        expect(result.pendingGrants[0].grant.ref).toEqual({
          email: {
            email: 'editor@example.com',
            emailCommitment,
          },
        });
      });

      test('distinguishes exact and effective grants', async () => {
        await actor.createAccessBatch({
          items: [
            {
              ref: { principal: aliceIdentity.getPrincipal() },
              accessClass: { ordinary: null },
              scope: { root: null },
              permission: READ,
              source: { directGrant: null },
              expiresAt: [],
            },
          ],
        });

        const exact = await actor.listAccessGrants({
          scope: [{ entry: [DIRECTORY, 'Shared/photos'] }],
          mode: { exact: null },
        });
        const effective = await actor.listAccessGrants({
          scope: [{ entry: [DIRECTORY, 'Shared/photos'] }],
          mode: { effective: null },
        });

        expect(exact.principalGrants).toHaveLength(0);
        expect(effective.principalGrants).toHaveLength(1);
        expect(effective.principalGrants[0].grant.principal.toText()).toBe(
          aliceIdentity.getPrincipal().toText(),
        );
        expect(effective.principalGrants[0].inheritedFrom).toEqual([
          { root: null },
        ]);
      });

      test('deduplicates repeated principal grants on the same scope', async () => {
        await actor.createAccessBatch({
          items: [
            {
              ref: { principal: aliceIdentity.getPrincipal() },
              accessClass: { ordinary: null },
              scope: { entry: [DIRECTORY, 'Shared'] },
              permission: READ,
              source: { directGrant: null },
              expiresAt: [],
            },
          ],
        });
        await actor.createAccessBatch({
          items: [
            {
              ref: { principal: aliceIdentity.getPrincipal() },
              accessClass: { ordinary: null },
              scope: { entry: [DIRECTORY, 'Shared'] },
              permission: READ_WRITE,
              source: { directGrant: null },
              expiresAt: [],
            },
          ],
        });

        const result = await actor.listAccessGrants({
          scope: [{ entry: [DIRECTORY, 'Shared'] }],
          mode: { exact: null },
        });

        expect(result.principalGrants).toHaveLength(1);
        expect(result.principalGrants[0].grant.principal.toText()).toBe(
          aliceIdentity.getPrincipal().toText(),
        );
        expect(result.principalGrants[0].grant.permission).toEqual(READ_WRITE);
      });

      test('deduplicates repeated email grants on the same scope', async () => {
        const emailCommitment = new Uint8Array([5, 6, 7, 8]);

        await actor.createAccessBatch({
          items: [
            {
              ref: {
                email: {
                  email: 'editor@example.com',
                  emailCommitment,
                },
              },
              accessClass: { ordinary: null },
              scope: { entry: [DIRECTORY, 'Shared'] },
              permission: READ,
              source: { directGrant: null },
              expiresAt: [],
            },
          ],
        });
        await actor.createAccessBatch({
          items: [
            {
              ref: {
                email: {
                  email: 'editor@example.com',
                  emailCommitment,
                },
              },
              accessClass: { ordinary: null },
              scope: { entry: [DIRECTORY, 'Shared'] },
              permission: READ_WRITE,
              source: { directGrant: null },
              expiresAt: [],
            },
          ],
        });

        const result = await actor.listAccessGrants({
          scope: [{ entry: [DIRECTORY, 'Shared'] }],
          mode: { exact: null },
        });

        expect(result.pendingGrants).toHaveLength(1);
        expect(result.pendingGrants[0].grant.permission).toEqual(READ_WRITE);
        expect(result.pendingGrants[0].grant.ref).toEqual({
          email: {
            email: 'editor@example.com',
            emailCommitment,
          },
        });
      });

      test('records storage events for standalone access mutations', async () => {
        expect(await actor.getStorageEventsUnreadCount()).toBe(0n);

        await actor.createAccessBatch({
          items: [
            {
              ref: { principal: aliceIdentity.getPrincipal() },
              accessClass: { ordinary: null },
              scope: { entry: [DIRECTORY, 'Shared'] },
              permission: READ,
              source: { directGrant: null },
              expiresAt: [],
            },
          ],
        });

        const events = await actor.listStorageEvents([], 10n);
        expect(
          events.some(
            (storedEvent) =>
              'access' in storedEvent.event &&
              'principalGrantCreated' in storedEvent.event.access,
          ),
        ).toBe(true);
        expect(await actor.getStorageEventsUnreadCount()).toBeGreaterThan(0n);

        await actor.markStorageEventsRead(events[events.length - 1].id);
        expect(await actor.getStorageEventsUnreadCount()).toBe(0n);
      });

      test('lists latest visible storage events and marks them read in one call', async () => {
        await actor.createAccessBatch({
          items: [
            {
              ref: { principal: aliceIdentity.getPrincipal() },
              accessClass: { ordinary: null },
              scope: { entry: [DIRECTORY, 'Shared'] },
              permission: READ,
              source: { directGrant: null },
              expiresAt: [],
            },
            {
              ref: { principal: bobIdentity.getPrincipal() },
              accessClass: { ordinary: null },
              scope: { entry: [DIRECTORY, 'Shared'] },
              permission: READ_WRITE,
              source: { directGrant: null },
              expiresAt: [],
            },
          ],
        });

        const events = await actor.listLatestStorageEvents(10n);

        expect(events.length).toBeGreaterThanOrEqual(2);
        expect(events[0].id).toBeGreaterThan(events[1].id);
        expect(await actor.getStorageEventsUnreadCount()).toBeGreaterThan(0n);

        await actor.markAllVisibleStorageEventsRead();

        expect(await actor.getStorageEventsUnreadCount()).toBe(0n);
      });
    });

    describe('access requests', () => {
      test('returns an existing pending request instead of creating duplicates', async () => {
        actor.setIdentity(aliceIdentity);
        const first = await actor.requestAccess({
          emailCommitment: [],
          message: ['Please grant access'],
        });
        const second = await actor.requestAccess({
          emailCommitment: [],
          message: ['Please grant access again'],
        });

        expect(second.id).toBe(first.id);
        expect(second.message).toEqual(['Please grant access']);

        actor.setIdentity(ownerIdentity);
        const requests = await actor.listAccessRequests();

        expect(requests).toHaveLength(1);
        expect(requests[0].id).toBe(first.id);
        expect(requests[0].requester.toText()).toBe(
          aliceIdentity.getPrincipal().toText(),
        );
      });

      test('returns only the caller latest access request', async () => {
        actor.setIdentity(aliceIdentity);
        const request = await actor.requestAccess({
          emailCommitment: [],
          message: ['Please grant access'],
        });

        const mine = await actor.getMyAccessRequest();
        expect(mine).toHaveLength(1);
        expect(mine[0].id).toBe(request.id);
        expect(mine[0].requester.toText()).toBe(
          aliceIdentity.getPrincipal().toText(),
        );

        actor.setIdentity(bobIdentity);
        await expect(actor.listAccessRequests()).rejects.toThrow();
        expect(await actor.getMyAccessRequest()).toEqual([]);
      });

      test('allows a root manager to list and resolve access requests', async () => {
        await grantPermission({
          entry: [],
          user: bobIdentity.getPrincipal(),
          permission: READ_WRITE_MANAGE,
        });

        actor.setIdentity(aliceIdentity);
        const request = await actor.requestAccess({
          emailCommitment: [],
          message: ['Please grant access'],
        });

        actor.setIdentity(bobIdentity);
        const requests = await actor.listAccessRequests();
        expect(requests.some((item) => item.id === request.id)).toBe(true);

        const resolved = await actor.resolveAccessRequest({
          requestId: request.id,
          decision: {
            approved: {
              scope: { root: null },
              permission: READ,
            },
          },
        });

        expect(resolved.status).toEqual({ approved: null });
        expect(
          await actor.hasPermission({
            entry: [],
            user: aliceIdentity.getPrincipal(),
            permission: READ,
          }),
        ).toBe(true);

        actor.setIdentity(aliceIdentity);
        const mine = await actor.getMyAccessRequest();
        expect(mine).toHaveLength(1);
        expect(mine[0].id).toBe(request.id);
        expect(mine[0].status).toEqual({ approved: null });
      });

      test('rejects access requests from principals that already have access', async () => {
        await grantPermission({
          entry: [],
          user: aliceIdentity.getPrincipal(),
          permission: READ,
        });

        actor.setIdentity(aliceIdentity);
        await expect(
          actor.requestAccess({
            emailCommitment: [],
            message: ['Please grant access'],
          }),
        ).rejects.toThrow(/caller already has access/);
      });
    });

    describe('createAccessBatch (3 users)', async () => {
      beforeEach(async () => {
        await actor.create({
          entry: [DIRECTORY, 'Shared/with-alice[rw]/photos'],
          createMode: CREATE_NEW,
          encryptionMode: [],
        });
        await actor.create({
          entry: [DIRECTORY, 'Shared/with-alice[rw]-and-bob[r]/documents'],
          createMode: CREATE_NEW,
          encryptionMode: [],
        });
        await actor.create({
          entry: [FILE, 'Private/wallet.dat'],
          createMode: CREATE_NEW,
          encryptionMode: [],
        });
        await grantPermission({
          entry: [[DIRECTORY, 'Shared/with-alice[rw]']],
          user: aliceIdentity.getPrincipal(),
          permission: READ_WRITE,
        });
        await grantPermission({
          entry: [[DIRECTORY, 'Shared/with-alice[rw]-and-bob[r]']],
          user: aliceIdentity.getPrincipal(),
          permission: READ_WRITE,
        });
        await grantPermission({
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

  describe('encryption mode', () => {
    test('should create plaintext file', async () => {
      const result = await actor.create({
        entry: [FILE, 'Public/readme.txt'],
        createMode: CREATE_NEW,
        encryptionMode: [{ Plaintext: null }],
      });
      expect('File' in result.metadata).toBeTruthy();
      if ('File' in result.metadata) {
        expect('Plaintext' in result.metadata.File.encryptionMode).toBeTruthy();
      }
    });

    test('should create encrypted file (default)', async () => {
      const result = await actor.create({
        entry: [FILE, 'Private/secret.dat'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      expect('File' in result.metadata).toBeTruthy();
      if ('File' in result.metadata) {
        expect('Encrypted' in result.metadata.File.encryptionMode).toBeTruthy();
      }
    });

    test('should inherit directory defaultEncryptionMode', async () => {
      await actor.create({
        entry: [DIRECTORY, 'PublicDir'],
        createMode: CREATE_NEW,
        encryptionMode: [{ Plaintext: null }],
      });
      const file = await actor.create({
        entry: [FILE, 'PublicDir/file.txt'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      if ('File' in file.metadata) {
        expect('Plaintext' in file.metadata.File.encryptionMode).toBeTruthy();
      }
    });
  });

  describe('staging area', () => {
    test('new file should not appear in list() until update()', async () => {
      // Create a new file — goes to staging
      await actor.create({
        entry: [FILE, 'Uploads/photo.jpg'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });

      // File should NOT be visible in list
      const { entries: items } = await actor.list([[DIRECTORY, 'Uploads']]);
      const fileNames = items.map((item) => item.name);
      expect(fileNames).not.toContain('photo.jpg');
    });

    test('file becomes visible in list() after full upload flow', async () => {
      // Create file
      await actor.create({
        entry: [FILE, 'Uploads/doc.txt'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });

      // Create batch
      const { batchId } = await actor.createBatch({
        entry: [FILE, 'Uploads/doc.txt'],
        createMode: GET_OR_CREATE,
        encryptionMode: [],
      });

      // Upload chunk
      const content = new TextEncoder().encode('Hello, World!');
      const { chunkId } = await actor.createChunk({
        batchId,
        content,
      });

      // Compute SHA-256
      const hashBuffer = await crypto.subtle.digest('SHA-256', content);
      const sha256 = new Uint8Array(hashBuffer);

      // Commit via update
      await actor.update({
        File: {
          path: 'Uploads/doc.txt',
          metadata: {
            sha256: [sha256],
            chunkIds: [chunkId],
            contentType: 'text/plain',
          },
        },
      });

      // File should now be visible in list
      const { entries: items } = await actor.list([[DIRECTORY, 'Uploads']]);
      const fileNames = items.map((item) => item.name);
      expect(fileNames).toContain('doc.txt');
    });

    test('directories created by staged file should be visible', async () => {
      // Create file in nested dirs
      await actor.create({
        entry: [FILE, 'Deep/Nested/Dir/file.txt'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });

      // Parent directories should be visible
      const { entries: rootItems } = await actor.list([]);
      expect(rootItems.map((i) => i.name)).toContain('Deep');

      const { entries: deepItems } = await actor.list([[DIRECTORY, 'Deep']]);
      expect(deepItems.map((i) => i.name)).toContain('Nested');
    });

    test('GetOrCreate on staged file should succeed (retry upload)', async () => {
      // Create file — goes to staging
      await actor.create({
        entry: [FILE, 'Staging/retry.bin'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });

      // GetOrCreate should work (retry upload)
      const result = await actor.create({
        entry: [FILE, 'Staging/retry.bin'],
        createMode: GET_OR_CREATE,
        encryptionMode: [],
      });
      expect(result.name).toBe('retry.bin');
    });

    test('CreateNew on staged file should throw', async () => {
      await actor.create({
        entry: [FILE, 'Staging/dup.bin'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });

      await expect(
        actor.create({
          entry: [FILE, 'Staging/dup.bin'],
          createMode: CREATE_NEW,
          encryptionMode: [],
        }),
      ).rejects.toThrowError();
    });

    test('GetOrCreate on committed file should not go to staging', async () => {
      // Create and commit a file first
      await actor.create({
        entry: [FILE, 'Committed/data.bin'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      const { batchId } = await actor.createBatch({
        entry: [FILE, 'Committed/data.bin'],
        createMode: GET_OR_CREATE,
        encryptionMode: [],
      });
      const content = new Uint8Array([1, 2, 3]);
      const { chunkId } = await actor.createChunk({ batchId, content });
      const hashBuffer = await crypto.subtle.digest('SHA-256', content);
      await actor.update({
        File: {
          path: 'Committed/data.bin',
          metadata: {
            sha256: [new Uint8Array(hashBuffer)],
            chunkIds: [chunkId],
            contentType: 'application/octet-stream',
          },
        },
      });

      // File should be visible (committed)
      let { entries: items } = await actor.list([[DIRECTORY, 'Committed']]);
      expect(items.map((i) => i.name)).toContain('data.bin');

      // Now GetOrCreate for new version
      await actor.create({
        entry: [FILE, 'Committed/data.bin'],
        createMode: GET_OR_CREATE,
        encryptionMode: [],
      });

      // File should STILL be visible (GetOrCreate doesn't re-stage)
      ({ entries: items } = await actor.list([[DIRECTORY, 'Committed']]));
      expect(items.map((i) => i.name)).toContain('data.bin');
    });
  });

  describe('versioning', () => {
    test('listVersions on new file returns 0 versions', async () => {
      await actor.create({
        entry: [FILE, 'Docs/v.txt'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      const versions = await actor.listVersions({
        entry: [FILE, 'Docs/v.txt'],
      });
      expect(versions).toHaveLength(0);
    });

    test('restoreVersion with invalid index should fail', async () => {
      await actor.create({
        entry: [FILE, 'Docs/v.txt'],
        createMode: CREATE_NEW,
        encryptionMode: [],
      });
      await expect(
        actor.restoreVersion({ entry: [FILE, 'Docs/v.txt'], version: 5n }),
      ).rejects.toThrowError();
    });
  });

  test('should reinstall the canister', async () => {
    await actor.create({
      entry: [DIRECTORY, 'test/dir/sub'],
      createMode: CREATE_NEW,
      encryptionMode: [],
    });
    const preReinstallTree = await actor.showTree([]);

    // Advance time to reset install_code rate limiter
    await pic.advanceTime(600_000);
    await pic.tick(10);

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
