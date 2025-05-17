import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiRadiogroupHelmComponent } from './ui-radiogroup-helm.component';

describe('UiRadiogroupHelmComponent', () => {
  let component: UiRadiogroupHelmComponent;
  let fixture: ComponentFixture<UiRadiogroupHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiRadiogroupHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiRadiogroupHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
