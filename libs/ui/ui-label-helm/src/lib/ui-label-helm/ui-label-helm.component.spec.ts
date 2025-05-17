import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiLabelHelmComponent } from './ui-label-helm.component';

describe('UiLabelHelmComponent', () => {
  let component: UiLabelHelmComponent;
  let fixture: ComponentFixture<UiLabelHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiLabelHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiLabelHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
