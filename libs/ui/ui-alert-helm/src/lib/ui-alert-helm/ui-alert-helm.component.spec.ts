import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiAlertHelmComponent } from './ui-alert-helm.component';

describe('UiAlertHelmComponent', () => {
  let component: UiAlertHelmComponent;
  let fixture: ComponentFixture<UiAlertHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiAlertHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiAlertHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
