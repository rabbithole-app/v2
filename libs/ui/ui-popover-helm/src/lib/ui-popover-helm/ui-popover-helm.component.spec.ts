import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiPopoverHelmComponent } from './ui-popover-helm.component';

describe('UiPopoverHelmComponent', () => {
  let component: UiPopoverHelmComponent;
  let fixture: ComponentFixture<UiPopoverHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiPopoverHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiPopoverHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
