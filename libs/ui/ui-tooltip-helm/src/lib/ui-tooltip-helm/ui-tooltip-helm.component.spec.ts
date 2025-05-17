import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiTooltipHelmComponent } from './ui-tooltip-helm.component';

describe('UiTooltipHelmComponent', () => {
  let component: UiTooltipHelmComponent;
  let fixture: ComponentFixture<UiTooltipHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiTooltipHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiTooltipHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
