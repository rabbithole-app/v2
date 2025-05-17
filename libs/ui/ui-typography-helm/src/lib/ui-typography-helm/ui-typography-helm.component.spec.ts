import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiTypographyHelmComponent } from './ui-typography-helm.component';

describe('UiTypographyHelmComponent', () => {
  let component: UiTypographyHelmComponent;
  let fixture: ComponentFixture<UiTypographyHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiTypographyHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiTypographyHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
