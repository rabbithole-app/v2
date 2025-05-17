import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { DelegationComponent } from './delegation.component';
import { AUTH_SERVICE } from '@rabbithole/auth';

vi.mock('../../../environments/environment', () => ({
  environment: {
    backendCanisterId: 'aaaaa-aa',
  },
}));

describe('DelegationComponent', () => {
  let component: DelegationComponent;
  let fixture: ComponentFixture<DelegationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DelegationComponent],
      providers: [
        provideRouter([]),
        { provide: AUTH_SERVICE, useValue: { isAuthenticated: () => true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DelegationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
