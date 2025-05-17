import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiCardHelmComponent } from './ui-card-helm.component';

describe('UiCardHelmComponent', () => {
  let component: UiCardHelmComponent;
  let fixture: ComponentFixture<UiCardHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiCardHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiCardHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
