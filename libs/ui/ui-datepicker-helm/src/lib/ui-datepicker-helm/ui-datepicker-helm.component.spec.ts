import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiDatepickerHelmComponent } from './ui-datepicker-helm.component';

describe('UiDatepickerHelmComponent', () => {
  let component: UiDatepickerHelmComponent;
  let fixture: ComponentFixture<UiDatepickerHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiDatepickerHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiDatepickerHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
