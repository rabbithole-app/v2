import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiBreadcrumbHelmComponent } from './ui-breadcrumb-helm.component';

describe('UiBreadcrumbHelmComponent', () => {
  let component: UiBreadcrumbHelmComponent;
  let fixture: ComponentFixture<UiBreadcrumbHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiBreadcrumbHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiBreadcrumbHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
