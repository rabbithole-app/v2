import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiInputHelmComponent } from './ui-input-helm.component';

describe('UiInputHelmComponent', () => {
  let component: UiInputHelmComponent;
  let fixture: ComponentFixture<UiInputHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiInputHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiInputHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
