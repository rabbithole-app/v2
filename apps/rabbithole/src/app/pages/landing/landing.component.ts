import { ChangeDetectionStrategy, Component } from '@angular/core';

import { ComparisonSectionComponent } from './components/comparison-section/comparison-section.component';
import { CtaSectionComponent } from './components/cta-section/cta-section.component';
import { FeaturesSectionComponent } from './components/features-section/features-section.component';
import { HeroSectionComponent } from './components/hero-section/hero-section.component';
import { PreviewSectionComponent } from './components/preview-section/preview-section.component';

@Component({
  selector: 'app-landing',
  imports: [
    HeroSectionComponent,
    FeaturesSectionComponent,
    PreviewSectionComponent,
    ComparisonSectionComponent,
    CtaSectionComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-landing-hero />
    <app-landing-features />
    <app-landing-preview />
    <app-landing-comparison />
    <app-landing-cta />
  `,
  host: {
    class: 'block relative',
  },
})
export class LandingComponent {}
