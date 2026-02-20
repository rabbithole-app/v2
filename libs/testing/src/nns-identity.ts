import { base64ToUint8Array } from '@dfinity/utils';
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';

const publicKey = 'Uu8wv55BKmk9ZErr6OIt5XR1kpEGXcOSOC1OYzrAwuk=';
const privateKey =
  'N3HB8Hh2PrWqhWH2Qqgr1vbU9T3gb1zgdBD8ZOdlQnVS7zC/nkEqaT1kSuvo4i3ldHWSkQZdw5I4LU5jOsDC6Q==';

export const minterIdentity = Ed25519KeyIdentity.fromKeyPair(
  base64ToUint8Array(publicKey),
  base64ToUint8Array(privateKey),
);
