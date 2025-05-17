import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiTableHelmComponent } from './ui-table-helm.component';

describe('UiTableHelmComponent', () => {
  let component: UiTableHelmComponent;
  let fixture: ComponentFixture<UiTableHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiTableHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiTableHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
