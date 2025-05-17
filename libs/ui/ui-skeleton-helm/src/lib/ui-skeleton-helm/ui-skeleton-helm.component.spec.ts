import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiSkeletonHelmComponent } from './ui-skeleton-helm.component';

describe('UiSkeletonHelmComponent', () => {
  let component: UiSkeletonHelmComponent;
  let fixture: ComponentFixture<UiSkeletonHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiSkeletonHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiSkeletonHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
