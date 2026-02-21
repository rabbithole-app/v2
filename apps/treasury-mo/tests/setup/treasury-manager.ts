import { type Actor, createIdentity } from "@dfinity/pic";
import { principalToSubAccount } from "@dfinity/utils";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";
import { resolve } from "node:path";

import { BaseManager, minterIdentity } from "@rabbithole/testing";

import {
  idlFactory as treasuryIdlFactory,
  init as treasuryInit,
  type _SERVICE as TreasuryService,
} from "../../declarations/treasury/treasury.did.js";

const TREASURY_WASM_PATH = resolve(
  import.meta.dirname,
  "..",
  "..",
  ".dfx",
  "local",
  "canisters",
  "treasury",
  "treasury.wasm",
);

export class TreasuryManager extends BaseManager {
  readonly adminIdentity: ReturnType<typeof createIdentity>;
  readonly treasuryActor: Actor<TreasuryService>;
  readonly treasuryCanisterId: Principal;

  private constructor(
    base: BaseManager,
    treasuryActor: Actor<TreasuryService>,
    treasuryCanisterId: Principal,
    adminIdentity: ReturnType<typeof createIdentity>,
  ) {
    super(
      base.pic,
      base.ownerIdentity,
      base.icpLedgerActor,
      base.cmcActor,
      base.applicationSubnetId,
    );
    this.treasuryActor = treasuryActor;
    this.treasuryCanisterId = treasuryCanisterId;
    this.adminIdentity = adminIdentity;
  }

  static override async create(): Promise<TreasuryManager> {
    const adminIdentity = createIdentity("treasury-admin");
    const base = await BaseManager.create();

    const fixture = await base.setupCanister<TreasuryService>({
      idlFactory: treasuryIdlFactory,
      wasm: TREASURY_WASM_PATH,
      arg: IDL.encode(treasuryInit({ IDL }), [
        { admin: adminIdentity.getPrincipal() },
      ]),
      sender: adminIdentity.getPrincipal(),
    });

    return new TreasuryManager(
      base,
      fixture.actor,
      fixture.canisterId,
      adminIdentity,
    );
  }

  /** Get ICP balance of a subaccount under the Treasury canister. */
  async getSubaccountBalance(principal: Principal): Promise<bigint> {
    const subaccount = principalToSubAccount(principal);
    return this.icpLedgerActor.icrc1_balance_of({
      owner: this.treasuryCanisterId,
      subaccount: [subaccount],
    });
  }

  /** Mint ICP to Treasury canister's default account (simulating ICPay deposit). */
  async mintToTreasury(amount: bigint): Promise<void> {
    this.icpLedgerActor.setIdentity(minterIdentity);
    const result = await this.icpLedgerActor.icrc1_transfer({
      to: { owner: this.treasuryCanisterId, subaccount: [] },
      fee: [],
      memo: [],
      from_subaccount: [],
      created_at_time: [],
      amount,
    });
    if (!("Ok" in result)) {
      throw new Error(`mintToTreasury failed: ${JSON.stringify(result)}`);
    }
  }
}
