import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiCarouselHelmComponent } from './ui-carousel-helm.component';

describe('UiCarouselHelmComponent', () => {
  let component: UiCarouselHelmComponent;
  let fixture: ComponentFixture<UiCarouselHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiCarouselHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiCarouselHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
