import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiHovercardHelmComponent } from './ui-hovercard-helm.component';

describe('UiHovercardHelmComponent', () => {
  let component: UiHovercardHelmComponent;
  let fixture: ComponentFixture<UiHovercardHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiHovercardHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiHovercardHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
