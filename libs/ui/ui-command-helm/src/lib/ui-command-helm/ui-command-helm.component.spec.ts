import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiCommandHelmComponent } from './ui-command-helm.component';

describe('UiCommandHelmComponent', () => {
  let component: UiCommandHelmComponent;
  let fixture: ComponentFixture<UiCommandHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiCommandHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiCommandHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
