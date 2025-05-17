import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiAspectratioHelmComponent } from './ui-aspectratio-helm.component';

describe('UiAspectratioHelmComponent', () => {
  let component: UiAspectratioHelmComponent;
  let fixture: ComponentFixture<UiAspectratioHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiAspectratioHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiAspectratioHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
