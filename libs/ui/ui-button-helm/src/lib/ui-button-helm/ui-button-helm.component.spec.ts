import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiButtonHelmComponent } from './ui-button-helm.component';

describe('UiButtonHelmComponent', () => {
  let component: UiButtonHelmComponent;
  let fixture: ComponentFixture<UiButtonHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiButtonHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiButtonHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
