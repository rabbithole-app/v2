import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiMenuHelmComponent } from './ui-menu-helm.component';

describe('UiMenuHelmComponent', () => {
  let component: UiMenuHelmComponent;
  let fixture: ComponentFixture<UiMenuHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiMenuHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiMenuHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
