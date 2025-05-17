import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFormfieldHelmComponent } from './ui-formfield-helm.component';

describe('UiFormfieldHelmComponent', () => {
  let component: UiFormfieldHelmComponent;
  let fixture: ComponentFixture<UiFormfieldHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiFormfieldHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiFormfieldHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
