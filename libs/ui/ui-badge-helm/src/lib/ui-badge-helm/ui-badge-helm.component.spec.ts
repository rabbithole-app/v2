import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiBadgeHelmComponent } from './ui-badge-helm.component';

describe('UiBadgeHelmComponent', () => {
  let component: UiBadgeHelmComponent;
  let fixture: ComponentFixture<UiBadgeHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiBadgeHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiBadgeHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
