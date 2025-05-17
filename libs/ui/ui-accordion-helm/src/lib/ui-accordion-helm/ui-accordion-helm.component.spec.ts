import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiAccordionHelmComponent } from './ui-accordion-helm.component';

describe('UiAccordionHelmComponent', () => {
  let component: UiAccordionHelmComponent;
  let fixture: ComponentFixture<UiAccordionHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiAccordionHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiAccordionHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
