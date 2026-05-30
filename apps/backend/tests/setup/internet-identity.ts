import { type HttpsOutcallResponseMock, type PocketIc } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";
import { Buffer } from "node:buffer";
import { resolve } from "node:path";

import { userBob } from "./helpers.ts";

export const II_BACKEND_CANISTER_ID = Principal.fromText("rdmx6-jaaaa-aaaaa-aaadq-cai");

const II_BACKEND_WASM_PATH = resolve(
  import.meta.dirname,
  "..",
  "..",
  ".icp",
  "cache",
  "artifacts",
  "internet_identity_backend",
);

const GOOGLE_TEST_JWT =
  "eyJhbGciOiJSUzI1NiIsImtpZCI6Ijc2M2Y3YzRjZDI2YTFlYjJiMWIzOWE4OGY0NDM0ZDFmNGQ5YTM2OGIiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiIzNjA1ODc5OTE2NjgtNjNicGMxZ25ncDFzNWdibzFhbGRhbDRhNTBjMWowYmIuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiIzNjA1ODc5OTE2NjgtNjNicGMxZ25ncDFzNWdibzFhbGRhbDRhNTBjMWowYmIuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJzdWIiOiIxMDcxNzAzNjg4OTgyMTkwMzU3MjEiLCJoZCI6ImRmaW5pdHkub3JnIiwiZW1haWwiOiJhbmRyaS5zY2hhdHpAZGZpbml0eS5vcmciLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwibm9uY2UiOiJmQkcxS3IzUWt5Z0dHelNJWG9Pd2p3RF95QjhXS0FfcVJPUlZjMFp0WHlJIiwibmJmIjoxNzQwNTgzNDEyLCJuYW1lIjoiQW5kcmkgU2NoYXR6IiwicGljdHVyZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0k1YUU0Mmo0Ml9JcEdqSHFjT2lUemVQLXRZaWNhMFZSLURnYklWcjJCWGtOSWxoUT1zOTYtYyIsImdpdmVuX25hbWUiOiJBbmRyaSIsImZhbWlseV9uYW1lIjoiU2NoYXR6IiwiaWF0IjoxNzQwNTgzNzEyLCJleHAiOjE3NDA1ODczMTIsImp0aSI6IjhjNjkzMWE4YmVmZjllOWM3OTRmYjM5ZTkwNTExOTM4MTk4MDgxZDYifQ.PVAbLj1Fv7AUwH16nFiedJkmPOUg1UkPnAkVj6S9MDhpEV467tP7iOxQCx64i0_imTymcjkzH9pcfTsaKpY8fWPrWSWZzDy9S4GygjOQeg13NXg_H23X2-IY_OVHKqtrAibhZZUppvczijqZja7-HmUivoAJIGsMOk1IxbJdalOhE5yQtsYEx4ZBxFemR7CTfMzopsAaRWgPHI7T0MENuiCbkSy_NYQPBzNpmGcKoZoyUbleFUzej8gbkqpoIUVdfwuNtoe_TMjED5eqJxi1Pip85iy4wJTa2RKUTZxUfqVCaTEftVt8U-PV1UgPsxpu0mKS5z5bXylmgclUzcNnmg";

const GOOGLE_TEST_SALT = new Uint8Array([
  107, 14, 204, 55, 92, 39, 93, 230, 53, 20, 153, 234, 70, 25, 120, 74, 136,
  94, 251, 187, 238, 96, 97, 180, 255, 135, 20, 149, 143, 27, 159, 83,
]);

const GOOGLE_TEST_PRINCIPAL = Principal.fromUint8Array(
  new Uint8Array([
    211, 40, 186, 145, 43, 2, 6, 17, 232, 23, 22, 44, 51, 178, 233, 163,
    131, 231, 82, 174, 66, 201, 203, 1, 102, 109, 20, 75, 2,
  ]),
);

const GOOGLE_TEST_PUBKEY = new Uint8Array([
  48, 94, 48, 12, 6, 10, 43, 6, 1, 4, 1, 131, 184, 67, 1, 1, 3, 78, 0,
  165, 1, 2, 3, 38, 32, 1, 33, 88, 32, 252, 182, 240, 218, 160, 61, 178,
  176, 17, 228, 185, 84, 148, 45, 86, 216, 171, 120, 72, 246, 212, 55,
  212, 167, 142, 59, 227, 0, 242, 182, 129, 211, 34, 88, 32, 158, 197,
  96, 131, 51, 156, 176, 65, 128, 29, 75, 98, 163, 187, 104, 38, 255, 65,
  92, 234, 229, 245, 221, 74, 40, 202, 29, 83, 162, 84, 177, 204,
]);

const GOOGLE_CERTS = JSON.stringify({
  keys: [
    {
      alg: "RS256",
      e: "AQAB",
      kid: "763f7c4cd26a1eb2b1b39a88f4434d1f4d9a368b",
      kty: "RSA",
      n: "y8TPCPz2Fp0OhBxsxu6d_7erT9f9XJ7mx7ZJPkkeZRxhdnKtg327D4IGYsC4fLAfpkC8qN58sZGkwRTNs-i7yaoD5_8nupq1tPYvnt38ddVghG9vws-2MvxfPQ9m2uxBEdRHmels8prEYGCH6oFKcuWVsNOt4l_OPoJRl4uiuiwd6trZik2GqDD_M6bn21_w6AD_jmbzN4mh8Od4vkA1Z9lKb3Qesksxdog-LWHsljN8ieiz1NhbG7M-GsIlzu-typJfud3tSJ1QHb-E_dEfoZ1iYK7pMcojb5ylMkaCj5QySRdJESq9ngqVRDjF4nX8DK5RQUS7AkrpHiwqyW0Csw",
      use: "sig",
    },
  ],
});

export interface SignedIdentityAttributes {
  data: Uint8Array;
  signature: Uint8Array;
}

export class InternetIdentityManager {
  constructor(
    private readonly pic: PocketIc,
    private readonly origin = "http://localhost:4200",
  ) {}

  async createGoogleOpenIdIdentity(): Promise<bigint> {
    return await createGoogleOpenIdIdentity(this.pic);
  }

  async deploy(): Promise<void> {
    await deployInternetIdentity(this.pic);
  }

  async getGoogleSignedAttributes(
    identityNumber: bigint,
    nonce: Uint8Array,
  ): Promise<SignedIdentityAttributes> {
    return await getGoogleSignedAttributes(this.pic, identityNumber, nonce, this.origin);
  }

  senderInfo(attributes: SignedIdentityAttributes): { info: Uint8Array; signer: Principal } {
    return {
      info: attributes.data,
      signer: II_BACKEND_CANISTER_ID,
    };
  }

  async updateCallWithSenderInfo({
    arg,
    canisterId,
    method,
    sender,
    senderInfo,
  }: {
    arg: Uint8Array;
    canisterId: Principal;
    method: string;
    sender: Principal;
    senderInfo: { info: Uint8Array; signer?: Principal };
  }): Promise<Uint8Array> {
    return await updateCallWithSenderInfo(this.pic, {
      arg,
      canisterId,
      method,
      sender,
      senderInfo: {
        info: senderInfo.info,
        signer: senderInfo.signer ?? II_BACKEND_CANISTER_ID,
      },
    });
  }
}

export const IdentityAttributesSyncResult = IDL.Variant({
  err: IDL.Variant({
    attributesNotFound: IDL.Null,
    expired: IDL.Null,
    malformedPayload: IDL.Null,
    verifiedEmailRequired: IDL.Null,
  }),
  ok: IDL.Null,
});

export const IdentityAttributesFinishResult = IDL.Variant({
  err: IDL.Variant({
    AmbiguousAttribute: IDL.Record({
      field: IDL.Text,
      sources: IDL.Vec(IDL.Text),
    }),
    FrontendOriginMismatch: IDL.Record({
      got: IDL.Text,
      expected: IDL.Vec(IDL.Text),
    }),
    FrontendOriginsNotConfigured: IDL.Null,
    MalformedCandid: IDL.Null,
    MissingField: IDL.Text,
    MixedSsoSources: IDL.Record({
      ssoKeys: IDL.Vec(IDL.Text),
      otherKeys: IDL.Vec(IDL.Text),
    }),
    NoAttributes: IDL.Null,
    Stale: IDL.Record({ ageNs: IDL.Nat }),
    UnknownNonce: IDL.Null,
    UntrustedSsoSource: IDL.Record({ domain: IDL.Text }),
  }),
  ok: IDL.Null,
});

const MetadataValueV2 = IDL.Rec();
const MetadataMapV2 = IDL.Vec(IDL.Tuple(IDL.Text, MetadataValueV2));

MetadataValueV2.fill(IDL.Variant({
  Bytes: IDL.Vec(IDL.Nat8),
  Map: MetadataMapV2,
  String: IDL.Text,
}));

const AuthnMethodData = IDL.Record({
  authn_method: IDL.Variant({
    PubKey: IDL.Record({ pubkey: IDL.Vec(IDL.Nat8) }),
    WebAuthn: IDL.Record({
      aaguid: IDL.Opt(IDL.Vec(IDL.Nat8)),
      credential_id: IDL.Vec(IDL.Nat8),
      pubkey: IDL.Vec(IDL.Nat8),
    }),
  }),
  last_authentication: IDL.Opt(IDL.Nat64),
  metadata: MetadataMapV2,
  security_settings: IDL.Record({
    protection: IDL.Variant({ Protected: IDL.Null, Unprotected: IDL.Null }),
    purpose: IDL.Variant({ Authentication: IDL.Null, Recovery: IDL.Null }),
  }),
});

const OpenIdConfig = IDL.Record({
  auth_scope: IDL.Vec(IDL.Text),
  auth_uri: IDL.Text,
  client_id: IDL.Text,
  email_verification: IDL.Opt(
    IDL.Variant({ Google: IDL.Null, Microsoft: IDL.Null, Unknown: IDL.Null }),
  ),
  fedcm_uri: IDL.Opt(IDL.Text),
  issuer: IDL.Text,
  jwks_uri: IDL.Text,
  logo: IDL.Text,
  name: IDL.Text,
});

const InternetIdentityInit = IDL.Record({
  captcha_config: IDL.Opt(
    IDL.Record({
      captcha_trigger: IDL.Variant({
        Dynamic: IDL.Record({
          current_rate_sampling_interval_s: IDL.Nat64,
          reference_rate_sampling_interval_s: IDL.Nat64,
          threshold_pct: IDL.Nat16,
        }),
        Static: IDL.Variant({ CaptchaDisabled: IDL.Null, CaptchaEnabled: IDL.Null }),
      }),
      max_unsolved_captchas: IDL.Nat64,
    }),
  ),
  openid_configs: IDL.Opt(IDL.Vec(OpenIdConfig)),
});

const PrepareIcrc3AttributeRequest = IDL.Record({
  account_number: IDL.Opt(IDL.Nat64),
  attributes: IDL.Vec(
    IDL.Record({
      key: IDL.Text,
      omit_scope: IDL.Bool,
      value: IDL.Opt(IDL.Vec(IDL.Nat8)),
    }),
  ),
  identity_number: IDL.Nat64,
  nonce: IDL.Vec(IDL.Nat8),
  origin: IDL.Text,
});

const GetIcrc3AttributeRequest = IDL.Record({
  account_number: IDL.Opt(IDL.Nat64),
  identity_number: IDL.Nat64,
  message: IDL.Vec(IDL.Nat8),
  origin: IDL.Text,
});

const OpenIdCredentialAddError = IDL.Variant({
  InternalCanisterError: IDL.Text,
  JwtExpired: IDL.Null,
  JwtVerificationFailed: IDL.Null,
  OpenIdCredentialAlreadyRegistered: IDL.Null,
  Unauthorized: IDL.Principal,
});

const internetIdentityIdlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    get_icrc3_attributes: IDL.Func(
      [GetIcrc3AttributeRequest],
      [IDL.Variant({
        Err: IDL.Reserved,
        Ok: IDL.Record({ signature: IDL.Vec(IDL.Nat8) }),
      })],
      ["query"],
    ),
    identity_registration_finish: IDL.Func(
      [IDL.Record({ authn_method: AuthnMethodData, name: IDL.Opt(IDL.Text) })],
      [IDL.Variant({
        Err: IDL.Reserved,
        Ok: IDL.Record({ identity_number: IDL.Nat64 }),
      })],
      [],
    ),
    identity_registration_start: IDL.Func(
      [],
      [IDL.Variant({ Err: IDL.Reserved, Ok: IDL.Reserved })],
      [],
    ),
    openid_credential_add: IDL.Func(
      [IDL.Nat64, IDL.Text, IDL.Vec(IDL.Nat8)],
      [IDL.Variant({ Err: OpenIdCredentialAddError, Ok: IDL.Null })],
      [],
    ),
    prepare_icrc3_attributes: IDL.Func(
      [PrepareIcrc3AttributeRequest],
      [IDL.Variant({
        Err: IDL.Reserved,
        Ok: IDL.Record({ message: IDL.Vec(IDL.Nat8) }),
      })],
      [],
    ),
  });

interface PocketIcWithPrivateClient {
  client: {
    awaitCall(req: {
      effectivePrincipal: { canisterId: Principal };
      messageId: string;
    }): Promise<{ body: Uint8Array }>;
    post(endpoint: string, body: unknown): Promise<unknown>;
  };
}

export async function createGoogleOpenIdIdentity(pic: PocketIc): Promise<bigint> {
  const authnMethod = {
    authn_method: { PubKey: { pubkey: GOOGLE_TEST_PUBKEY } },
    last_authentication: [],
    metadata: [],
    security_settings: {
      protection: { Unprotected: null },
      purpose: { Authentication: null },
    },
  };

  await pic.updateCall({
    arg: IDL.encode([], []),
    canisterId: II_BACKEND_CANISTER_ID,
    method: "identity_registration_start",
    sender: userBob.getPrincipal(),
  });

  const finishResponse = await pic.updateCall({
    arg: IDL.encode(
      [IDL.Record({ authn_method: AuthnMethodData, name: IDL.Opt(IDL.Text) })],
      [{ authn_method: authnMethod, name: [] }],
    ),
    canisterId: II_BACKEND_CANISTER_ID,
    method: "identity_registration_finish",
    sender: userBob.getPrincipal(),
  });
  const [finishResult] = IDL.decode(
    [IDL.Variant({
      Err: IDL.Reserved,
      Ok: IDL.Record({ identity_number: IDL.Nat64 }),
    })],
    finishResponse,
  ) as [{ Err?: unknown; Ok?: { identity_number: bigint } }];

  if (!finishResult.Ok) {
    throw new Error(`II registration failed: ${JSON.stringify(finishResult)}`);
  }

  const credentialResponse = await pic.updateCall({
    arg: IDL.encode(
      [IDL.Nat64, IDL.Text, IDL.Vec(IDL.Nat8)],
      [finishResult.Ok.identity_number, GOOGLE_TEST_JWT, GOOGLE_TEST_SALT],
    ),
    canisterId: II_BACKEND_CANISTER_ID,
    method: "openid_credential_add",
    sender: GOOGLE_TEST_PRINCIPAL,
  });
  const [credentialResult] = IDL.decode(
    [IDL.Variant({ Err: OpenIdCredentialAddError, Ok: IDL.Null })],
    credentialResponse,
  ) as [{ Err?: unknown; Ok?: null }];

  if (!("Ok" in credentialResult)) {
    throw new Error(`II openid_credential_add failed: ${JSON.stringify(credentialResult)}`);
  }

  return finishResult.Ok.identity_number;
}

export async function deployInternetIdentity(pic: PocketIc): Promise<void> {
  await pic.setupCanister({
    arg: IDL.encode([IDL.Opt(InternetIdentityInit)], [[{
      captcha_config: [{
        captcha_trigger: { Static: { CaptchaDisabled: null } },
        max_unsolved_captchas: 50n,
      }],
      openid_configs: [[{
        auth_scope: ["openid", "profile", "email"],
        auth_uri: "https://accounts.google.com/o/oauth2/v2/auth",
        client_id: "360587991668-63bpc1gngp1s5gbo1aldal4a50c1j0bb.apps.googleusercontent.com",
        email_verification: [{ Google: null }],
        fedcm_uri: ["https://accounts.google.com/gsi/fedcm.json"],
        issuer: "https://accounts.google.com",
        jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
        logo: "logo",
        name: "Google",
      }]],
    }]]),
    idlFactory: internetIdentityIdlFactory,
    targetCanisterId: II_BACKEND_CANISTER_ID,
    wasm: II_BACKEND_WASM_PATH,
  });

  await pic.setTime(1_740_583_715_239);
  await mockGoogleCertsResponse(pic);
}

export async function getGoogleSignedAttributes(
  pic: PocketIc,
  identityNumber: bigint,
  nonce: Uint8Array,
  origin = "http://localhost:4200",
): Promise<SignedIdentityAttributes> {
  const prepareResponse = await pic.updateCall({
    arg: IDL.encode([PrepareIcrc3AttributeRequest], [{
      account_number: [],
      attributes: [
        { key: "openid:https://accounts.google.com:email", omit_scope: false, value: [] },
        { key: "openid:https://accounts.google.com:verified_email", omit_scope: false, value: [] },
        { key: "openid:https://accounts.google.com:name", omit_scope: false, value: [] },
      ],
      identity_number: identityNumber,
      nonce,
      origin,
    }]),
    canisterId: II_BACKEND_CANISTER_ID,
    method: "prepare_icrc3_attributes",
    sender: GOOGLE_TEST_PRINCIPAL,
  });
  const [prepareResult] = IDL.decode(
    [IDL.Variant({
      Err: IDL.Reserved,
      Ok: IDL.Record({ message: IDL.Vec(IDL.Nat8) }),
    })],
    prepareResponse,
  ) as [{ Err?: unknown; Ok?: { message: number[] | Uint8Array } }];

  if (!prepareResult.Ok) {
    throw new Error(`II prepare_icrc3_attributes failed: ${JSON.stringify(prepareResult)}`);
  }

  await pic.tick(2);
  const message = Uint8Array.from(prepareResult.Ok.message);
  const getResponse = await pic.queryCall({
    arg: IDL.encode([GetIcrc3AttributeRequest], [{
      account_number: [],
      identity_number: identityNumber,
      message,
      origin,
    }]),
    canisterId: II_BACKEND_CANISTER_ID,
    method: "get_icrc3_attributes",
    sender: GOOGLE_TEST_PRINCIPAL,
  });
  const [getResult] = IDL.decode(
    [IDL.Variant({
      Err: IDL.Reserved,
      Ok: IDL.Record({ signature: IDL.Vec(IDL.Nat8) }),
    })],
    getResponse,
  ) as [{ Err?: unknown; Ok?: { signature: number[] | Uint8Array } }];

  if (!getResult.Ok) {
    throw new Error(`II get_icrc3_attributes failed: ${JSON.stringify(getResult)}`);
  }

  return {
    data: message,
    signature: Uint8Array.from(getResult.Ok.signature),
  };
}

export async function updateCallWithSenderInfo(
  pic: PocketIc,
  {
    arg,
    canisterId,
    method,
    sender,
    senderInfo,
  }: {
    arg: Uint8Array;
    canisterId: Principal;
    method: string;
    sender: Principal;
    senderInfo: { info: Uint8Array; signer: Principal };
  },
): Promise<Uint8Array> {
  const client = (pic as unknown as PocketIcWithPrivateClient).client;
  const encodedCanisterId = base64(canisterId.toUint8Array());

  const submit = await client.post("/update/submit_ingress_message", {
    canister_id: encodedCanisterId,
    effective_principal: { CanisterId: encodedCanisterId },
    method,
    payload: base64(arg),
    sender: base64(sender.toUint8Array()),
    sender_info: {
      info: base64(senderInfo.info),
      signer: base64(senderInfo.signer.toUint8Array()),
    },
  }) as { Err?: { reject_message: string }; Ok?: { message_id: string } };

  if (!submit.Ok) {
    throw new Error(`PocketIC sender_info call failed: ${JSON.stringify(submit)}`);
  }

  const response = await client.awaitCall({
    effectivePrincipal: { canisterId },
    messageId: submit.Ok.message_id,
  });
  return response.body;
}

function base64(payload: Uint8Array): string {
  return Buffer.from(payload).toString("base64");
}

async function mockGoogleCertsResponse(pic: PocketIc): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt++) {
    await pic.tick();
    const outcalls = await pic.getPendingHttpsOutcalls();
    const certRequest = outcalls.find(
      ({ url }) => url === "https://www.googleapis.com/oauth2/v3/certs",
    );

    if (!certRequest) continue;

    const response: HttpsOutcallResponseMock = {
      body: new TextEncoder().encode(GOOGLE_CERTS),
      headers: [["Content-Type", "application/json"]],
      statusCode: 200,
      type: "success",
    };
    await pic.mockPendingHttpsOutcall({
      requestId: certRequest.requestId,
      response,
      subnetId: certRequest.subnetId,
    });
    await pic.tick();
    return;
  }

  throw new Error("II did not request Google JWKS");
}
