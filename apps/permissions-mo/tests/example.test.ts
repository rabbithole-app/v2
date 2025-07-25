import { resolve } from "node:path";
import { describe, beforeEach, afterEach, expect, inject, test } from "vitest";
import {
  PocketIc,
  type Actor,
  createIdentity,
  type CanisterFixture,
} from "@dfinity/pic";
import { Principal } from "@dfinity/principal";
import { IDL } from "@dfinity/candid";

// Import generated types for your canister
import {
  type _SERVICE,
  idlFactory,
  init,
} from "../declarations/example/example.did.js";

// Define the path to your canister's WASM file
export const WASM_PATH = resolve(
  import.meta.dirname,
  "..",
  ".dfx",
  "local",
  "canisters",
  "example",
  "example.wasm",
);

const ownerIdentity = createIdentity("owner");
const aliceIdentity = createIdentity("alice");
const bobIdentity = createIdentity("bob");
const charlieIdentity = createIdentity("charlie");
const danIdentity = createIdentity("dan");

async function createPic(): Promise<[PocketIc, CanisterFixture<_SERVICE>]> {
  // create a new PocketIC instance
  let pic = await PocketIc.create(inject("PIC_URL"));

  // Setup the canister and actor
  const fixture = await pic.setupCanister<_SERVICE>({
    idlFactory,
    wasm: WASM_PATH,
    sender: ownerIdentity.getPrincipal(),
  });

  return [pic, fixture];
}

describe("Permissions", () => {
  let pic: PocketIc;
  let canisterId: Principal;
  let actor: Actor<_SERVICE>;

  beforeEach(async () => {
    const [picInstance, fixture] = await createPic();
    pic = picInstance;

    // Save the actor and canister ID for use in tests
    actor = fixture.actor;
    canisterId = fixture.canisterId;
    actor.setIdentity(ownerIdentity);
  });

  afterEach(async () => {
    // tear down the PocketIC instance
    await pic?.tearDown();
  });

  describe("has_permission", () => {
    test("Owner should have #Admin", async () => {
      expect(await actor.has_permission([], { Admin: null })).toBeTruthy();
    });

    test("Owner should have #Permissions", async () => {
      expect(
        await actor.has_permission([], { Permissions: null }),
      ).toBeTruthy();
    });

    test("Owner should have #Write", async () => {
      expect(await actor.has_permission([], { Write: null })).toBeTruthy();
    });

    test("Owner should have #Read", async () => {
      expect(await actor.has_permission([], { Read: null })).toBeTruthy();
    });

    test("Alice should not have #Read", async () => {
      actor.setPrincipal(aliceIdentity.getPrincipal());
      expect(await actor.has_permission([], { Read: null })).toBeFalsy();
    });
  });

  describe("create", () => {
    test("should create entries", async () => {
      const result = await actor.create({
        Directory: "Documents/Books/classic",
      });
      expect(result).toEqual({ ok: 3n });
      const result2 = await actor.create({
        Directory: "Documents/Books/detective",
      });
      expect(result2).toEqual({ ok: 4n });
      const result3 = await actor.create({
        Asset: "Documents/Photos/1.jpg",
      });
      expect(result3).toEqual({ ok: 6n });
      // const treeContent = await actor.show_tree([
      //   { Directory: "Documents/Books" },
      // ]);
      // console.log(treeContent);
    });

    test("should return err if entry exists", async () => {
      const result = await actor.create({
        Directory: "Documents/Books/classic",
      });
      expect(result).toEqual({ ok: 3n });
      const result2 = await actor.create({
        Directory: "Documents/Books/classic",
      });
      expect(result2).toEqual({ err: { AlreadyExists: null } });
    });
  });

  describe("delete", () => {
    test("should return err NotEmpty with recursive false", async () => {
      const result = await actor.create({
        Asset: "Documents/WP/bitcoin.pdf",
      });
      expect(result).toEqual({ ok: 3n });
      const result2 = await actor.delete(
        {
          Directory: "Documents/WP",
        },
        false,
      );
      expect(result2).toEqual({ err: { NotEmpty: null } });
    });

    test("should return err NotFound", async () => {
      const result = await actor.delete(
        {
          Asset: "Documents/Photos/not-found.jpg",
        },
        true,
      );
      expect(result).toEqual({ err: { NotFound: null } });
    });
    test("should delete entries", async () => {
      // create entries
      const result = await actor.create({
        Asset: "Documents/WP/bitcoin.pdf",
      });
      expect(result).toEqual({ ok: 3n });
      const result2 = await actor.create({
        Asset: "Private/wallet.dat",
      });
      expect(result2).toEqual({ ok: 5n });

      // delete directory
      const result3 = await actor.delete(
        {
          Directory: "Documents",
        },
        true,
      );
      expect(result3).toEqual({ ok: null });

      // delete asset
      const result4 = await actor.delete(
        {
          Asset: "Private/wallet.dat",
        },
        false,
      );
      expect(result4).toEqual({ ok: null });
    });
  });

  describe("grant_permission", () => {
    beforeEach(async () => {
      await actor.create({
        Asset: "Shared/with-alice[rw]-bob[r]-charlie[p]/bitcoin.pdf",
      });
      await actor.create({ Directory: "Shared/with-alice[rw]-anyone[r]" });
      await actor.create({ Asset: "Private/wallet.dat" });
      await actor.grant_permission(
        [{ Directory: "Shared/with-alice[rw]-bob[r]-charlie[p]" }],
        aliceIdentity.getPrincipal(),
        { Write: null },
      );
      await actor.grant_permission(
        [{ Directory: "Shared/with-alice[rw]-bob[r]-charlie[p]" }],
        bobIdentity.getPrincipal(),
        { Read: null },
      );
      await actor.grant_permission(
        [{ Directory: "Shared/with-alice[rw]-bob[r]-charlie[p]" }],
        charlieIdentity.getPrincipal(),
        { Permissions: null },
      );
      await actor.grant_permission(
        [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
        aliceIdentity.getPrincipal(),
        { Write: null },
      );
      await actor.grant_permission(
        [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
        Principal.anonymous(),
        { Read: null },
      );
    });

    describe("Alice", () => {
      beforeEach(() => {
        actor.setPrincipal(aliceIdentity.getPrincipal());
      });

      test("should have #Read/#Write permissions", async () => {
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-bob[r]-charlie[p]" }],
            {
              Read: null,
            },
          ),
        ).toBeTruthy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-bob[r]-charlie[p]" }],
            {
              Write: null,
            },
          ),
        ).toBeTruthy();
        expect(
          await actor.has_permission(
            [
              {
                Asset: "Shared/with-alice[rw]-bob[r]-charlie[p]/bitcoin.pdf",
              },
            ],
            {
              Read: null,
            },
          ),
        ).toBeTruthy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
            {
              Read: null,
            },
          ),
        ).toBeTruthy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
            {
              Write: null,
            },
          ),
        ).toBeTruthy();
      });

      test("should not have #Permissions/#Admin permissions", async () => {
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-bob[r]-charlie[p]" }],
            {
              Permissions: null,
            },
          ),
        ).toBeFalsy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-bob[r]-charlie[p]" }],
            {
              Admin: null,
            },
          ),
        ).toBeFalsy();
      });

      test("should not have #Read for Private", async () => {
        expect(
          await actor.has_permission([{ Directory: "Private" }], {
            Read: null,
          }),
        ).toBeFalsy();
        expect(
          await actor.has_permission([{ Asset: "Private/wallet.dat" }], {
            Read: null,
          }),
        ).toBeFalsy();
      });
    });

    describe("Bob", () => {
      beforeEach(() => {
        actor.setPrincipal(bobIdentity.getPrincipal());
      });

      test("should have #Read permission", async () => {
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-bob[r]-charlie[p]" }],
            {
              Read: null,
            },
          ),
        ).toBeTruthy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-bob[r]-charlie[p]" }],
            {
              Write: null,
            },
          ),
        ).toBeFalsy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-bob[r]-charlie[p]" }],
            {
              Permissions: null,
            },
          ),
        ).toBeFalsy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-bob[r]-charlie[p]" }],
            {
              Admin: null,
            },
          ),
        ).toBeFalsy();
      });

      test("should have #Read permission for public entry", async () => {
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
            {
              Read: null,
            },
          ),
        ).toBeTruthy();
      });
    });

    describe("Charlie", () => {
      beforeEach(() => {
        actor.setPrincipal(charlieIdentity.getPrincipal());
      });

      test("should have #Read/#Write/#Permissions permissions", async () => {
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-bob[r]-charlie[p]" }],
            {
              Read: null,
            },
          ),
        ).toBeTruthy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-bob[r]-charlie[p]" }],
            {
              Write: null,
            },
          ),
        ).toBeTruthy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-bob[r]-charlie[p]" }],
            {
              Permissions: null,
            },
          ),
        ).toBeTruthy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-bob[r]-charlie[p]" }],
            {
              Admin: null,
            },
          ),
        ).toBeFalsy();
      });

      test("should grant permission lower then #Admin", async () => {
        // add #Read permission
        const result = await actor.grant_permission(
          [{ Asset: "Shared/with-alice[rw]-bob[r]-charlie[p]/bitcoin.pdf" }],
          danIdentity.getPrincipal(),
          { Read: null },
        );
        expect(result).toEqual({ ok: null });
        actor.setPrincipal(danIdentity.getPrincipal());
        expect(
          await actor.has_permission(
            [
              {
                Asset: "Shared/with-alice[rw]-bob[r]-charlie[p]/bitcoin.pdf",
              },
            ],
            { Read: null },
          ),
        ).toBeTruthy();
        expect(
          await actor.has_permission(
            [
              {
                Directory: "Shared/with-alice[rw]-bob[r]-charlie[p]",
              },
            ],
            { Read: null },
          ),
        ).toBeFalsy();

        // add #Write permission
        actor.setPrincipal(charlieIdentity.getPrincipal());
        const result2 = await actor.grant_permission(
          [{ Asset: "Shared/with-alice[rw]-bob[r]-charlie[p]/bitcoin.pdf" }],
          danIdentity.getPrincipal(),
          { Write: null },
        );
        expect(result2).toEqual({ ok: null });
        actor.setPrincipal(danIdentity.getPrincipal());
        expect(
          await actor.has_permission(
            [
              {
                Asset: "Shared/with-alice[rw]-bob[r]-charlie[p]/bitcoin.pdf",
              },
            ],
            { Write: null },
          ),
        ).toBeTruthy();

        // add #Permissions permission
        actor.setPrincipal(charlieIdentity.getPrincipal());
        const result3 = await actor.grant_permission(
          [{ Asset: "Shared/with-alice[rw]-bob[r]-charlie[p]/bitcoin.pdf" }],
          danIdentity.getPrincipal(),
          { Permissions: null },
        );
        expect(result3).toEqual({ ok: null });
        actor.setPrincipal(danIdentity.getPrincipal());
        expect(
          await actor.has_permission(
            [
              {
                Asset: "Shared/with-alice[rw]-bob[r]-charlie[p]/bitcoin.pdf",
              },
            ],
            { Permissions: null },
          ),
        ).toBeTruthy();

        // add #Admin permission
        actor.setPrincipal(charlieIdentity.getPrincipal());
        await expect(
          actor.grant_permission(
            [
              {
                Asset: "Shared/with-alice[rw]-bob[r]-charlie[p]/bitcoin.pdf",
              },
            ],
            danIdentity.getPrincipal(),
            { Admin: null },
          ),
        ).rejects.toThrowError();
      });
    });

    describe("anonymous", () => {
      beforeEach(() => {
        actor.setPrincipal(Principal.anonymous());
      });

      test("should have #Read permission", async () => {
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
            {
              Read: null,
            },
          ),
        ).toBeTruthy();
      });
    });
  });

  describe("revoke_permission", () => {
    beforeEach(async () => {
      await actor.create({
        Directory: "Shared/with-alice[rw]-anyone[r]",
      });
      await actor.grant_permission(
        [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
        aliceIdentity.getPrincipal(),
        { Write: null },
      );
      await actor.grant_permission(
        [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
        Principal.anonymous(),
        { Read: null },
      );
    });

    describe("Alice", () => {
      beforeEach(async () => {
        const result = await actor.revoke_permission(
          [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
          aliceIdentity.getPrincipal(),
          { Write: null },
        );
        expect(result).toEqual({ ok: null });
        actor.setPrincipal(aliceIdentity.getPrincipal());
      });

      test("should not have #Write permission", async () => {
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
            {
              Write: null,
            },
          ),
        ).toBeFalsy();
      });
    });

    describe("anonymous", () => {
      beforeEach(async () => {
        const result = await actor.revoke_permission(
          [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
          Principal.anonymous(),
          { Read: null },
        );
        expect(result).toEqual({ ok: null });
        actor.setPrincipal(Principal.anonymous());
      });

      test("should not have #Read permission", async () => {
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
            {
              Read: null,
            },
          ),
        ).toBeFalsy();
      });
    });
  });

  describe("clear", () => {
    beforeEach(async () => {
      await actor.create({
        Asset: "Shared/ic.pdf",
      });
      await actor.grant_permission(
        [{ Directory: "Shared" }],
        aliceIdentity.getPrincipal(),
        { Read: null },
      );
    });

    test("should clear #Read permission", async () => {
      expect(await actor.clear([{ Directory: "Shared" }], true)).toEqual({
        ok: null,
      });
      actor.setPrincipal(aliceIdentity.getPrincipal());
      expect(
        await actor.has_permission([{ Directory: "Shared" }], { Read: null }),
      ).toBeFalsy();
    });
  });

  describe.skip("with owner", () => {
    /*describe("grant_permission (3 users)", { skip: true }, async () => {
      beforeEach(async () => {
        await actor.create({ Directory: "Shared/with-alice[rw]/photos" });
        await actor.create({
          Directory: "Shared/with-alice[rw]-and-bob[r]/documents",
        });
        await actor.create({ Asset: "Private/wallet.dat" });
        await actor.grant_permission(
          [{ Directory: "Shared/with-alice[rw]" }],
          aliceIdentity.getPrincipal(),
          { Write: null },
        );
        await actor.grant_permission(
          [{ Directory: "Shared/with-alice[rw]-and-bob[r]" }],
          aliceIdentity.getPrincipal(),
          { Write: null },
        );
        await actor.grant_permission(
          [{ Directory: "Shared/with-alice[rw]-and-bob[r]" }],
          bobIdentity.getPrincipal(),
          { Read: null },
        );

        actor.setIdentity(aliceIdentity);
      });

      test("Alice should have permissions #Read and #Write", async () => {
        expect(
          await actor.has_permission([{ Directory: "Shared/with-alice[rw]" }], {
            Read: null,
          }),
        ).toBeTruthy();
        expect(
          await actor.has_permission([{ Directory: "Shared/with-alice[rw]" }], {
            Write: null,
          }),
        ).toBeTruthy();
        expect(
          await actor.has_permission([{ Directory: "Shared/with-alice[rw]" }], {
            Permissions: null,
          }),
        ).toBeFalsy();
        expect(
          await actor.has_permission([{ Directory: "Shared/with-alice[rw]" }], {
            Admin: null,
          }),
        ).toBeFalsy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-and-bob[r]" }],
            {
              Read: null,
            },
          ),
        ).toBeTruthy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-and-bob[r]" }],
            {
              Write: null,
            },
          ),
        ).toBeTruthy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-and-bob[r]" }],
            {
              Permissions: null,
            },
          ),
        ).toBeFalsy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-and-bob[r]" }],
            {
              Admin: null,
            },
          ),
        ).toBeFalsy();
      });

      test("Bob should have permission #Read", async () => {
        actor.setPrincipal(bobIdentity.getPrincipal());
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-and-bob[r]" }],
            {
              Read: null,
            },
          ),
        ).toBeTruthy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-and-bob[r]" }],
            {
              Write: null,
            },
          ),
        ).toBeFalsy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-and-bob[r]" }],
            {
              Permissions: null,
            },
          ),
        ).toBeFalsy();
        expect(
          await actor.has_permission(
            [{ Directory: "Shared/with-alice[rw]-and-bob[r]" }],
            {
              Admin: null,
            },
          ),
        ).toBeFalsy();
      });
    });*/
    // describe("grant_permission (public)", async () => {
    //   beforeEach(async () => {
    //     await actor.create({ Directory: "Shared/with-alice[rw]-anyone[r]" });
    //     await actor.grant_permission(
    //       [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
    //       aliceIdentity.getPrincipal(),
    //       { Write: null },
    //     );
    //     await actor.grant_permission(
    //       [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
    //       Principal.anonymous(),
    //       { Read: null },
    //     );
    //     actor.setIdentity(aliceIdentity);
    //   });
    //   test("Alice should have permission #Read and #Write", async () => {
    //     actor.setPrincipal(aliceIdentity.getPrincipal());
    //     expect(
    //       await actor.has_permission(
    //         [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
    //         {
    //           Read: null,
    //         },
    //       ),
    //     ).toBeTruthy();
    //     expect(
    //       await actor.has_permission(
    //         [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
    //         {
    //           Write: null,
    //         },
    //       ),
    //     ).toBeTruthy();
    //   });
    //   test("Anonymous should have permission #Read", async () => {
    //     actor.setPrincipal(Principal.anonymous());
    //     expect(
    //       await actor.has_permission(
    //         [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
    //         {
    //           Read: null,
    //         },
    //       ),
    //     ).toBeTruthy();
    //   });
    //   test("Bob should have permission #Read", async () => {
    //     actor.setPrincipal(bobIdentity.getPrincipal());
    //     expect(
    //       await actor.has_permission(
    //         [{ Directory: "Shared/with-alice[rw]-anyone[r]" }],
    //         {
    //           Read: null,
    //         },
    //       ),
    //     ).toBeTruthy();
    //   });
    // });
  });

  test("should reinstall the canister", async () => {
    await actor.create({ Directory: "test/dir/sub" });
    const preReinstallTree = await actor.show_tree([]);

    await pic.reinstallCode({
      canisterId,
      wasm: WASM_PATH,
      arg: IDL.encode(init({ IDL }), []),
      sender: ownerIdentity.getPrincipal(),
    });
    const postReinstallTree = await actor.show_tree([]);

    expect(postReinstallTree).not.toEqual(preReinstallTree);
  });
});
