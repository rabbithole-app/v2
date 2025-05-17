import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiToggleHelmComponent } from './ui-toggle-helm.component';

describe('UiToggleHelmComponent', () => {
  let component: UiToggleHelmComponent;
  let fixture: ComponentFixture<UiToggleHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiToggleHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiToggleHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
