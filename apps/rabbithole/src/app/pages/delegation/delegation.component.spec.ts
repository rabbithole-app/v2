import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AUTH_CONFIG, AUTH_SERVICE } from '@rabbithole/auth';
import { AvatarService, MAIN_ACTOR_TOKEN, ProfileService } from '@rabbithole/core';

import { DelegationComponent } from './delegation.component';

vi.mock('../../../environments/environment', () => ({
  environment: {
    backendCanisterId: 'aaaaa-aa',
  },
}));

describe('DelegationComponent', () => {
  let component: DelegationComponent;
  let fixture: ComponentFixture<DelegationComponent>;
  const profile = signal(null);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DelegationComponent],
      providers: [
        provideRouter([]),
        {
          provide: AUTH_SERVICE,
          useValue: {
            identity: vi.fn(),
            isAuthenticated: () => false,
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
        {
          provide: MAIN_ACTOR_TOKEN,
          useValue: signal({
            getUser: vi.fn(),
          }),
        },
        {
          provide: AvatarService,
          useValue: {
            avatarSrc: vi.fn(() => null),
          },
        },
        {
          provide: ProfileService,
          useValue: {
            profile,
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
