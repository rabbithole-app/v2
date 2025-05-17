import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiScrollareaHelmComponent } from './ui-scrollarea-helm.component';

describe('UiScrollareaHelmComponent', () => {
  let component: UiScrollareaHelmComponent;
  let fixture: ComponentFixture<UiScrollareaHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiScrollareaHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiScrollareaHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
