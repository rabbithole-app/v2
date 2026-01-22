import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AUTH_SERVICE } from '@rabbithole/auth';
import { APP_NAME_TOKEN } from '@rabbithole/core';

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
        { provide: AUTH_SERVICE, useValue: { isAuthenticated: () => true } },
        { provide: APP_NAME_TOKEN, useValue: 'rabbithole' },
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
