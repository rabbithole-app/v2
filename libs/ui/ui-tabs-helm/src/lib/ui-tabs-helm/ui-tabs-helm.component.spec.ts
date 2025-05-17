import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiTabsHelmComponent } from './ui-tabs-helm.component';

describe('UiTabsHelmComponent', () => {
  let component: UiTabsHelmComponent;
  let fixture: ComponentFixture<UiTabsHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiTabsHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiTabsHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
