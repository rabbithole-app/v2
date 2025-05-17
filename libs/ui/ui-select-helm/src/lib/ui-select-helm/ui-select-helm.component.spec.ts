import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiSelectHelmComponent } from './ui-select-helm.component';

describe('UiSelectHelmComponent', () => {
  let component: UiSelectHelmComponent;
  let fixture: ComponentFixture<UiSelectHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiSelectHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiSelectHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
