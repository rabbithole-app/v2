import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiSonnerHelmComponent } from './ui-sonner-helm.component';

describe('UiSonnerHelmComponent', () => {
  let component: UiSonnerHelmComponent;
  let fixture: ComponentFixture<UiSonnerHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiSonnerHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiSonnerHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
