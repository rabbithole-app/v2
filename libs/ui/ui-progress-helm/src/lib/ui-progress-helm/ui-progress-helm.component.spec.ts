import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiProgressHelmComponent } from './ui-progress-helm.component';

describe('UiProgressHelmComponent', () => {
  let component: UiProgressHelmComponent;
  let fixture: ComponentFixture<UiProgressHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiProgressHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiProgressHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
