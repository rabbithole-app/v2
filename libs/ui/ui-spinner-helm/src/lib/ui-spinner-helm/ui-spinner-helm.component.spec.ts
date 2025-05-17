import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiSpinnerHelmComponent } from './ui-spinner-helm.component';

describe('UiSpinnerHelmComponent', () => {
  let component: UiSpinnerHelmComponent;
  let fixture: ComponentFixture<UiSpinnerHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiSpinnerHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiSpinnerHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
