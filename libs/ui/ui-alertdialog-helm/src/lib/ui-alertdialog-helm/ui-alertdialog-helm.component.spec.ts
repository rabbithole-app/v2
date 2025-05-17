import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiAlertdialogHelmComponent } from './ui-alertdialog-helm.component';

describe('UiAlertdialogHelmComponent', () => {
  let component: UiAlertdialogHelmComponent;
  let fixture: ComponentFixture<UiAlertdialogHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiAlertdialogHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiAlertdialogHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
