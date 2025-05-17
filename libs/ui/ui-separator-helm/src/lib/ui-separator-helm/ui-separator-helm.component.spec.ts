import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiSeparatorHelmComponent } from './ui-separator-helm.component';

describe('UiSeparatorHelmComponent', () => {
  let component: UiSeparatorHelmComponent;
  let fixture: ComponentFixture<UiSeparatorHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiSeparatorHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiSeparatorHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
