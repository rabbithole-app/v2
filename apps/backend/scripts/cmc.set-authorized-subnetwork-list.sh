#!/bin/bash
set -e

if [[ $1 ]]; then
    SUBNET_ID=$(node ./scripts/subnet-id.mjs)
    dfx canister call cmc set_authorized_subnetwork_list "(record {
        who = opt principal \"$1\";
        subnets = vec { principal \"$SUBNET_ID\" }
    })"
fi