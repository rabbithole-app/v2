import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiSheetHelmComponent } from './ui-sheet-helm.component';

describe('UiSheetHelmComponent', () => {
  let component: UiSheetHelmComponent;
  let fixture: ComponentFixture<UiSheetHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiSheetHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiSheetHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
