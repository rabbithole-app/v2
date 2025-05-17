import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiAvatarHelmComponent } from './ui-avatar-helm.component';

describe('UiAvatarHelmComponent', () => {
  let component: UiAvatarHelmComponent;
  let fixture: ComponentFixture<UiAvatarHelmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiAvatarHelmComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiAvatarHelmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
