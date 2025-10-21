import type { Identity } from "@dfinity/agent";
import {
  type Actor,
  type CanisterFixture,
  createIdentity,
  PocketIc,
} from "@dfinity/pic";
import { Principal } from "@dfinity/principal";
import { toBigIntNanoSeconds } from "@dfinity/utils";
import { faker } from "@faker-js/faker";
import { addDays, subDays } from "date-fns";
import { resolve } from "node:path";
import { filter, isEmpty, pick, prop, sortBy, splice, take } from "remeda";
import { afterEach, beforeEach, describe, expect, inject, test } from "vitest";

// Import generated types for your canister
import {
  type _SERVICE,
  type CreateProfileArgs,
  idlFactory,
  type ListOptions,
} from "../src/declarations/rabbithole-backend/rabbithole-backend.did.js";
import { setupChunkedCanister } from "./ic-management.utils";

// Define the path to your canister's WASM file
export const WASM_PATH = resolve(
  import.meta.dirname,
  "..",
  ".dfx",
  "local",
  "canisters",
  "rabbithole-backend",
  "rabbithole-backend.wasm",
);

const ownerIdentity = createIdentity("owner");

async function createPic(): Promise<[PocketIc, CanisterFixture<_SERVICE>]> {
  // create a new PocketIC instance
  const pic = await PocketIc.create(inject("PIC_URL"));

  // Setup the canister and actor
  const fixture = await setupChunkedCanister<_SERVICE>({
    pic,
    wasmPath: WASM_PATH,
    sender: ownerIdentity,
    idlFactory,
  });

  // next block to init ecdsa keypair in the canister
  await pic.tick();

  return [pic, fixture];
}

function createRandomUser(): { args: CreateProfileArgs; identity: Identity } {
  const identity = createIdentity(faker.string.uuid());
  const hasDisplayName = faker.datatype.boolean();
  const hasAvatar = faker.datatype.boolean();
  const invited = faker.datatype.boolean(0.3);

  return {
    identity,
    args: {
      username: faker.internet.username().substring(0, 20),
      displayName: hasDisplayName ? [faker.person.fullName()] : [],
      avatarUrl: hasAvatar ? [faker.image.avatar()] : [],
      inviter: invited ? [ownerIdentity.getPrincipal()] : [],
    },
  };
}

const USERS = faker.helpers.multiple(createRandomUser, {
  count: 10,
});

describe("Profiles", () => {
  let pic: PocketIc;
  let canisterId: Principal;
  let actor: Actor<_SERVICE>;

  beforeEach(async () => {
    const [picInstance, fixture] = await createPic();
    pic = picInstance;

    // Save the actor and canister ID for use in tests
    actor = fixture.actor;
    canisterId = fixture.canisterId;

    let startDate = subDays(new Date(), 14);
    for await (const { identity, args } of USERS) {
      actor.setIdentity(identity);
      startDate = addDays(startDate, 1);
      await pic.setTime(startDate);
      await actor.createProfile(args);
    }
  });

  afterEach(async () => {
    // tear down the PocketIC instance
    await pic?.tearDown();
  });

  test("should create profile", async () => {
    const { identity, args } = createRandomUser();
    actor.setIdentity(identity);
    const id = await actor.createProfile(args);
    expect(id).toBe(10n);
  });

  test("should read profile", async () => {
    const { identity, args } = USERS[0];
    actor.setIdentity(identity);
    const result = await actor.getProfile();
    const profile = result[0];

    expect(profile).toBeDefined();
    expect(profile?.id.toText()).toEqual(identity.getPrincipal().toText());
    expect(profile?.username).toBe(args.username);
  });

  test("should update profile", async () => {
    const { identity } = USERS[0];
    actor.setIdentity(identity);
    const result = await actor.updateProfile({
      avatarUrl: [],
      displayName: ["John Do"],
    });
    expect(result).toBeNull();
    const result2 = await actor.getProfile();
    const profile = result2[0];
    expect(profile).toBeDefined();
    expect(profile?.displayName).toEqual(["John Do"]);
    expect(profile?.avatarUrl).toEqual([]);
  });

  test("should delete profile", async () => {
    const { identity } = USERS[0];
    actor.setIdentity(identity);
    const result = await actor.deleteProfile();
    expect(result).toBeNull();
    const result2 = await actor.getProfile();
    expect(result2).toEqual([]);
  });

  test("should check username", async () => {
    const username = USERS[0].args.username;
    const result = await actor.usernameExists(username);
    expect(result).toBeTruthy();
    const result2 = await actor.usernameExists(faker.internet.username());
    expect(result2).toBeFalsy();
  });

  test("should return list of profiles", async () => {
    const users = USERS.map(({ args: value }) => pick(value, ["username"]));
    const defaultOptions: ListOptions = {
      pagination: { offset: 0n, limit: 10n },
      count: true,
      sort: [],
      filter: {
        id: [],
        username: [],
        displayName: [],
        inviter: [],
        createdAt: [],
        avatarUrl: [],
      },
    };

    // default options
    const result = await actor.listProfiles(defaultOptions);
    expect(result.data).toMatchObject(users);

    // pagination
    const result2 = await actor.listProfiles({
      ...defaultOptions,
      pagination: { offset: 3n, limit: 5n },
    });
    expect(result2.data).toMatchObject(take(splice(users, 0, 3, []), 5));

    // sort
    const result3 = await actor.listProfiles({
      ...defaultOptions,
      sort: [["username", { Descending: null }]],
    });
    expect(result3.data).toMatchObject(
      sortBy(users, [prop("username"), "desc"]),
    );

    // filter id
    const selectedUsers = take(USERS, 3);
    const pricipals = selectedUsers.map(({ identity }) =>
      identity.getPrincipal(),
    );
    const users2 = selectedUsers.map(({ args: value }) =>
      pick(value, ["username"]),
    );
    const result4 = await actor.listProfiles({
      ...defaultOptions,
      sort: [["createdAt", { Ascending: null }]],
      filter: {
        ...defaultOptions.filter,
        id: [pricipals],
      },
    });
    expect(result4.data).toMatchObject(users2);

    // filter username
    const result5 = await actor.listProfiles({
      ...defaultOptions,
      filter: {
        ...defaultOptions.filter,
        username: [users[0].username],
      },
    });
    expect(result5.data).toMatchObject(take(users, 1));

    // filter displayName
    const usersWithDisplayName = filter(
      USERS.map(({ args }) => args),
      (v) => !isEmpty(v.displayName),
    );
    const result6 = await actor.listProfiles({
      ...defaultOptions,
      filter: {
        ...defaultOptions.filter,
        displayName: usersWithDisplayName[0].displayName,
      },
    });
    expect(result6.data).toMatchObject(take(usersWithDisplayName, 1));

    // filter inviter
    const usersWithInviter = filter(
      USERS.map(({ args }) => args),
      (v) => !isEmpty(v.inviter),
    );
    const result7 = await actor.listProfiles({
      ...defaultOptions,
      filter: {
        ...defaultOptions.filter,
        inviter: [[ownerIdentity.getPrincipal()]],
      },
    });
    expect(result7.data).toMatchObject(usersWithInviter);

    // filter createdAt
    const result8 = await actor.listProfiles({
      ...defaultOptions,
      filter: {
        ...defaultOptions.filter,
        createdAt: [
          {
            min: [toBigIntNanoSeconds(subDays(new Date(), 10))], // skips first 4 users
            max: [],
          },
        ],
      },
    });
    expect(result8.data).toMatchObject(splice(users, 0, 4, []));

    const minDate = subDays(new Date(), 10);
    const result9 = await actor.listProfiles({
      ...defaultOptions,
      filter: {
        ...defaultOptions.filter,
        createdAt: [
          {
            min: [toBigIntNanoSeconds(minDate)],
            max: [toBigIntNanoSeconds(addDays(minDate, 5))], // 5 days
          },
        ],
      },
    });
    expect(result9.data).toMatchObject(take(splice(users, 0, 4, []), 5));

    // filter avatarUrl
    const usersWithAvatar = filter(
      USERS.map(({ args }) => args),
      (v) => !isEmpty(v.avatarUrl),
    );
    const result10 = await actor.listProfiles({
      ...defaultOptions,
      filter: {
        ...defaultOptions.filter,
        avatarUrl: [true],
      },
    });
    expect(result10.data).toMatchObject(usersWithAvatar);
    const usersWithoutAvatar = filter(
      USERS.map(({ args }) => args),
      (v) => isEmpty(v.avatarUrl),
    );
    const result11 = await actor.listProfiles({
      ...defaultOptions,
      filter: {
        ...defaultOptions.filter,
        avatarUrl: [false],
      },
    });
    expect(result11.data).toMatchObject(usersWithoutAvatar);
  });
});
