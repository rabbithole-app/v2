import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiIconHelmComponent } from './ui-icon-helm.component';

describe('UiIconHelmComponent', () => {
  let component: UiIconHelmComponent;
  let fixture: ComponentFixture<UiIconHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiIconHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiIconHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
