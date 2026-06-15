import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleCheck,
  lucideDatabase,
  lucideExternalLink,
  lucideGithub,
  lucideGlobe,
  lucideKeyRound,
  lucideSettings,
  lucideShieldCheck,
} from '@ng-icons/lucide';

import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmHoverCardImports } from '@spartan-ng/helm/hover-card';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

type CellHint = 'controller' | 'direct-url' | 'vetkeys';

interface CompCell {
  readonly hint?: CellHint;
  readonly label: string;
}

interface CompRow {
  readonly icon: string;
  readonly label: string;
  readonly rabbithole: CompCell;
  readonly typical: CompCell;
}

@Component({
  selector: 'app-landing-comparison',
  imports: [
    NgIcon,
    HlmBadge,
    ...HlmButtonImports,
    ...HlmHoverCardImports,
    ...HlmTableImports,
    ...HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideCheck,
      lucideCircleCheck,
      lucideDatabase,
      lucideGithub,
      lucideGlobe,
      lucideKeyRound,
      lucideSettings,
      lucideShieldCheck,
      lucideExternalLink,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block px-6 py-16',
  },
  templateUrl: './comparison-section.component.html',
})
export class ComparisonSectionComponent {
  readonly rows: CompRow[] = [
    {
      icon: 'lucideDatabase',
      label: 'Infrastructure owner',
      typical: cell('Provider-operated service'),
      rabbithole: cell('A canister you control'),
    },
    {
      icon: 'lucideGlobe',
      label: 'Frontend access',
      typical: cell('Provider app or domain'),
      rabbithole: cell('Own frontend at direct canister URL', 'direct-url'),
    },
    {
      icon: 'lucideShieldCheck',
      label: 'Access decision',
      typical: cell('Account or service layer'),
      rabbithole: cell('Checked by the same canister'),
    },
    {
      icon: 'lucideKeyRound',
      label: 'File keys',
      typical: cell('Password or app-managed keys'),
      rabbithole: cell('IC vetKeys on demand', 'vetkeys'),
    },
    {
      icon: 'lucideSettings',
      label: 'Admin control',
      typical: cell('Provider remains operator'),
      rabbithole: cell('You become the controller', 'controller'),
    },
    {
      icon: 'lucideCircleCheck',
      label: 'Verification',
      typical: cell('Provider/app dependent'),
      rabbithole: cell('Open source, hashes, certified state'),
    },
  ];
}

function cell(label: string, hint?: CellHint): CompCell {
  return { hint, label };
}
