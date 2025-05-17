import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiSliderHelmComponent } from './ui-slider-helm.component';

describe('UiSliderHelmComponent', () => {
  let component: UiSliderHelmComponent;
  let fixture: ComponentFixture<UiSliderHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiSliderHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiSliderHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
