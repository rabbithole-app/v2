# Deploying Cycles Minting Canister Locally

To create canisters using the CMC, you must have appropriate rights for the caller. These rights are set using the Governance canister. In order to avoid installing unnecessary canisters, we need to make the `set_authorized_subnetwork_list` method available for calling not only by the governance canister, for this we need to comment out [these lines](https://github.com/dfinity/ic/blob/a23bb5a4a5b8824bddf103c5fdcadbbae8d6ae05/rs/nns/cmc/src/main.rs#L497-L499).

## How to build a custom cycles-minting-canister.wasm?

Clone the `dfinity/ic` repository and go to the `rs/nns/cmc` directory:
```sh
git clone https://github.com/dfinity/ic
cd ic/rs/nns/cmc
sed -i '' '497,499s|^\([[:space:]]*\)|\1// |' src/main.rs
rm src/main.rs.bak
cargo build --release --target wasm32-unknown-unknown
ic-wasm ../../../target/wasm32-unknown-unknown/release/cycles-minting-canister.wasm -o cycles-minting-canister-custom.wasm shrink
```
Copy `cycles-minting-canister-custom.wasm` to the project.

## Setting rights
Once the CMC canister is deployed, we will be able to call this method and assign rights to specific principals. To do this, in addition to the Principal of the caller, we need to find out `subnetId`, I wrote [a small script](../../scripts/subnet-id.mjs). Now, knowing who should have the right to create canisters and `subnetId`, we can execute [scripts/cmc.set-authorized-subnetwork-list.sh](../../scripts/cmc.set-authorized-subnetwork-list.sh):

```sh
docker compose exec backend ./scripts/cmc.set-authorized-subnetwork-list.sh "2fwaj-kv37q-d6mhg-a34ef-oi7a4-p7uvv-r3afh-nz5q6-sqcjs-oy6mo-5qe"
```