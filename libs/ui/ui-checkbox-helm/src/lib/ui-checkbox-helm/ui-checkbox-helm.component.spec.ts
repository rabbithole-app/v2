import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiCheckboxHelmComponent } from './ui-checkbox-helm.component';

describe('UiCheckboxHelmComponent', () => {
  let component: UiCheckboxHelmComponent;
  let fixture: ComponentFixture<UiCheckboxHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiCheckboxHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiCheckboxHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
