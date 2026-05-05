import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { BrnAccordionImports } from '@spartan-ng/brain/accordion';

import { HlmAccordionImports } from '@spartan-ng/helm/accordion';

const FAQ_ITEMS = [
  {
    question: 'What is a canister?',
    answer: 'A canister is a smart contract on the Internet Computer blockchain. It stores your files, encryption keys, and permissions. You are the sole controller — no one else can access or modify your data.',
  },
  {
    question: 'Can I lose my files?',
    answer: "Your data is stored on-chain (in your canister's stable memory) or on Caffeine Blob Storage (encrypted). As long as your canister has cycles to run, your data persists. The Insurance Fund covers canister costs for months after subscription cancellation.",
  },
  {
    question: 'What payment methods are accepted?',
    answer: 'We accept ICP, ckUSDC, ckUSDT, ckETH on the Internet Computer, USDC and USDT on Base (Ethereum L2), and SOL, USDC, USDT on Solana. You can also pay via ICPay checkout.',
  },
  {
    question: 'What happens if Rabbithole shuts down?',
    answer: 'Your canister and data remain yours. The code is open source — you can deploy your own version of the WASM to your canister. VetKey encryption parameters are public, so decryption remains possible from any canister.',
  },
  {
    question: 'Do I need Pro for each storage?',
    answer: 'No. Pro is per-account ($9.90/month) and covers ALL your storages. Each storage requires a one-time License ($4.90), but the Pro subscription applies to your entire account.',
  },
] as const;

@Component({
  selector: 'rbth-pricing-faq',
  imports: [...BrnAccordionImports, ...HlmAccordionImports, NgIcon],
  template: `
    <div class="space-y-4">
      <h2 class="text-2xl font-semibold text-center">FAQ</h2>
      <div hlmAccordion>
        @for (item of faqItems; track item.question) {
          <div hlmAccordionItem>
            <button hlmAccordionTrigger>
              {{ item.question }}
              <ng-icon hlmAccordionIcon />
            </button>
            <hlm-accordion-content>
              <p class="text-sm text-muted-foreground">{{ item.answer }}</p>
            </hlm-accordion-content>
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingFaqComponent {
  faqItems = FAQ_ITEMS;
}
