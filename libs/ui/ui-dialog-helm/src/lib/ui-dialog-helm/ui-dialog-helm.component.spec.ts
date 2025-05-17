import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiDialogHelmComponent } from './ui-dialog-helm.component';

describe('UiDialogHelmComponent', () => {
  let component: UiDialogHelmComponent;
  let fixture: ComponentFixture<UiDialogHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiDialogHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiDialogHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
