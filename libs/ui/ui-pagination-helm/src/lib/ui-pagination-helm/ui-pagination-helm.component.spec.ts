import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiPaginationHelmComponent } from './ui-pagination-helm.component';

describe('UiPaginationHelmComponent', () => {
  let component: UiPaginationHelmComponent;
  let fixture: ComponentFixture<UiPaginationHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiPaginationHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiPaginationHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
