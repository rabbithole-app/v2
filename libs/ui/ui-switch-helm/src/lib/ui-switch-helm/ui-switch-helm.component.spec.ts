import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiSwitchHelmComponent } from './ui-switch-helm.component';

describe('UiSwitchHelmComponent', () => {
  let component: UiSwitchHelmComponent;
  let fixture: ComponentFixture<UiSwitchHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiSwitchHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiSwitchHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
