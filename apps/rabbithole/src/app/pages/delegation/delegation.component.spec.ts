import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AUTH_CONFIG, AUTH_SERVICE } from '@rabbithole/auth';

import { DelegationComponent } from './delegation.component';

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
        {
          provide: AUTH_SERVICE,
          useValue: {
            identity: vi.fn(),
            isAuthenticated: () => true,
            principalId: () => '2vxsx-fae',
            signIn: vi.fn(),
            signOut: vi.fn(),
          },
        },
        {
          provide: AUTH_CONFIG,
          useValue: {
            appUrl: 'http://localhost:4200',
            delegationPath: '/delegation',
            scheme: 'rabbithole',
          },
        },
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
