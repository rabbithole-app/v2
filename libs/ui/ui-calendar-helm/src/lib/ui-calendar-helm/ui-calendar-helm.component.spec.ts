import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiCalendarHelmComponent } from './ui-calendar-helm.component';

describe('UiCalendarHelmComponent', () => {
  let component: UiCalendarHelmComponent;
  let fixture: ComponentFixture<UiCalendarHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiCalendarHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiCalendarHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
