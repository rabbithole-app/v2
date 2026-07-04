import { ChangeDetectionStrategy, Component } from '@angular/core';

import { AmbassadorSectionComponent } from './components/ambassador-section/ambassador-section.component';
import { ComparisonSectionComponent } from './components/comparison-section/comparison-section.component';
import { CtaSectionComponent } from './components/cta-section/cta-section.component';
import { FeaturesSectionComponent } from './components/features-section/features-section.component';
import { HeroSectionComponent } from './components/hero-section/hero-section.component';
import { HowItWorksSectionComponent } from './components/how-it-works-section/how-it-works-section.component';
import { PreviewSectionComponent } from './components/preview-section/preview-section.component';
import { LandingPricingSectionComponent } from './components/pricing-section/pricing-section.component';

@Component({
  selector: 'app-landing',
  imports: [
    HeroSectionComponent,
    HowItWorksSectionComponent,
    FeaturesSectionComponent,
    PreviewSectionComponent,
    ComparisonSectionComponent,
    LandingPricingSectionComponent,
    AmbassadorSectionComponent,
    CtaSectionComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-landing-hero />
    <app-landing-how-it-works />
    <app-landing-features />
    <app-landing-preview />
    <app-landing-comparison />
    <app-landing-pricing-section />
    <app-landing-ambassador />
    <app-landing-cta />
  `,
  host: {
    class: 'block relative',
  },
})
export class LandingComponent {}
