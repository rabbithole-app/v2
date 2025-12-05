import { effect, Injectable, resource } from '@angular/core';

import { injectCyclesMintingCanister } from '../injectors';

const NUMBER_XDR_PER_ONE_ICP = 10_000;

@Injectable({ providedIn: 'root' })
export class CyclesMintingCanisterService {
  readonly #cmc = injectCyclesMintingCanister();

  readonly icpXdrConversionRate = resource({
    params: () => this.#cmc(),
    loader: async ({ params: cmc }) => {
      const xdr_permyriad_per_icp = await cmc.getIcpToCyclesConversionRate();
      const CYCLES_PER_XDR = BigInt(1_000_000_000_000);

      // trillionRatio
      return (
        (xdr_permyriad_per_icp * CYCLES_PER_XDR) /
        BigInt(NUMBER_XDR_PER_ONE_ICP)
      );
    },
  });

  constructor() {
    effect(() => {
      const rate = this.icpXdrConversionRate.value();
      if (rate) {
        console.log('ICP to Cycles conversion rate:', rate);
      }
    });
  }
}
