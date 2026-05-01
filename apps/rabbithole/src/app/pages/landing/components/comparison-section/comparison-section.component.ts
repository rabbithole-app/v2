import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideExternalLink,
  lucideGithub,
  lucideMinus,
  lucideShieldCheck,
  lucideX,
} from '@ng-icons/lucide';

import { HlmBadge } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmTableImports } from '@spartan-ng/helm/table';

type CellValue = 'no' | 'partial' | 'yes';

interface CompRow {
  readonly google: CellValue;
  readonly label: string;
  readonly proton: CellValue;
  readonly rabbithole: CellValue;
  readonly tresorit: CellValue;
}

@Component({
  selector: 'app-landing-comparison',
  imports: [NgIcon, HlmBadge, ...HlmButtonImports, ...HlmTableImports],
  providers: [
    provideIcons({ lucideCheck, lucideX, lucideMinus, lucideGithub, lucideShieldCheck, lucideExternalLink }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block py-16 px-6',
  },
  template: `
    <div class="mx-auto max-w-4xl">
      <div class="mb-12 text-center">
        <span hlmBadge variant="secondary" class="mb-4">Comparison</span>
        <h2 class="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          How Rabbithole compares
        </h2>
      </div>

      <div class="pointer-events-auto overflow-x-auto">
        <table hlmTable class="w-full">
          <thead>
            <tr hlmTr>
              <th hlmTh class="w-[200px]"></th>
              <th hlmTh class="text-center font-bold text-primary text-xs sm:text-sm">Rabbithole</th>
              <th hlmTh class="text-center text-xs sm:text-sm">Google Drive</th>
              <th hlmTh class="text-center text-xs sm:text-sm">Tresorit</th>
              <th hlmTh class="text-center text-xs sm:text-sm">ProtonDrive</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows; track row.label) {
              <tr hlmTr>
                <td hlmTd class="font-medium">{{ row.label }}</td>
                <td hlmTd class="text-center">
                  <ng-icon [name]="icon(row.rabbithole)" [class]="colorClass(row.rabbithole)" size="18" />
                </td>
                <td hlmTd class="text-center">
                  <ng-icon [name]="icon(row.google)" [class]="colorClass(row.google)" size="18" />
                </td>
                <td hlmTd class="text-center">
                  <ng-icon [name]="icon(row.tresorit)" [class]="colorClass(row.tresorit)" size="18" />
                </td>
                <td hlmTd class="text-center">
                  <ng-icon [name]="icon(row.proton)" [class]="colorClass(row.proton)" size="18" />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Social proof — integrated -->
      <div class="pointer-events-auto mt-10 flex flex-wrap items-center justify-center gap-3">
        <a
          hlmBtn
          variant="outline"
          href="https://github.com/rabbithole-app/v2"
          target="_blank"
          rel="noopener"
        >
          <ng-icon name="lucideGithub" size="18" />
          Source Code
          <ng-icon name="lucideExternalLink" size="14" />
        </a>
        <span hlmBadge variant="outline" class="h-9 gap-2 px-4 text-sm">
          <ng-icon name="lucideShieldCheck" size="16" />
          WASM verified via SHA-256
        </span>
      </div>
    </div>
  `,
})
export class ComparisonSectionComponent {
  readonly rows: CompRow[] = [
    { label: 'End-to-end encrypted', rabbithole: 'yes', google: 'no', tresorit: 'yes', proton: 'yes' },
    { label: 'Zero-knowledge', rabbithole: 'yes', google: 'no', tresorit: 'yes', proton: 'yes' },
    { label: 'No passwords needed', rabbithole: 'yes', google: 'no', tresorit: 'no', proton: 'no' },
    { label: 'Decentralized', rabbithole: 'yes', google: 'no', tresorit: 'no', proton: 'no' },
    { label: 'You own infrastructure', rabbithole: 'yes', google: 'no', tresorit: 'no', proton: 'no' },
    { label: 'Open source', rabbithole: 'yes', google: 'no', tresorit: 'no', proton: 'partial' },
  ];

  colorClass(value: CellValue): string {
    return value === 'yes'
      ? 'text-emerald-500'
      : value === 'partial'
        ? 'text-amber-500'
        : 'text-muted-foreground/40';
  }

  icon(value: CellValue): string {
    return value === 'yes' ? 'lucideCheck' : value === 'partial' ? 'lucideMinus' : 'lucideX';
  }
}
