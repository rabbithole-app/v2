import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiTogglegroupHelmComponent } from './ui-togglegroup-helm.component';

describe('UiTogglegroupHelmComponent', () => {
  let component: UiTogglegroupHelmComponent;
  let fixture: ComponentFixture<UiTogglegroupHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiTogglegroupHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiTogglegroupHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
