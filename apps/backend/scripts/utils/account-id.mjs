import { AccountIdentifier } from "@dfinity/ledger-icp";
import { Principal } from "@dfinity/principal";

const principalText = process.argv[2];

if (!principalText) {
  console.error("Usage: node account-id.mjs <principal>");
  process.exit(1);
}

try {
  const principal = Principal.fromText(principalText);
  const accountId = AccountIdentifier.fromPrincipal({
    principal,
    subAccount: undefined,
  });
  
  // Convert blob to hex string for use in dfx canister call
  const hex = Buffer.from(accountId.toUint8Array()).toString("hex");
  console.log(hex);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}

