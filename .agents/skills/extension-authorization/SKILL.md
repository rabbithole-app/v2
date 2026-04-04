---
name: extension-authorization
description: Authorization system with role-based access control. Must-have for all apps that manage personal or access-restricted data.
version: 0.1.4
compatibility:
  mops:
    caffeineai-authorization: "~0.1.0"
  npm:
    "@caffeineai/core-infrastructure": "~0.1.0"
caffeineai-subscription: [none]
---

# Authorization

## Overview

This skill adds an authentication and authorization system with role-based access control using the mixin pattern. The `MixinAuthorization` mixin provides standard authorization endpoints automatically.

# Backend

Authentication system with role-based access control.

There is a prefabricated library `mo:caffeineai-authorization/access-control.mo`. It provides core authentication with role-based access control.

## Module API

```mo:caffeineai-authorization/access-control.mo
module {
  public type UserRole = {
    #admin;
    #user;
    #guest;
  };

  public type AccessControlState = { /* internal state */ };

  public func initState() : AccessControlState;
  public func getUserRole(state : AccessControlState, caller : Principal) : UserRole;
  public func assignRole(state : AccessControlState, caller : Principal, user : Principal, role : UserRole);
  public func isAdmin(state : AccessControlState, caller : Principal) : Bool;
  public func hasPermission(state : AccessControlState, caller : Principal, requiredRole : UserRole) : Bool;
};
```

Initialization is handled internally by `MixinAuthorization` -- do not call `initialize` directly. The first authenticated user to log in automatically becomes admin; no token or secret is required.

IMPORTANT: The `include MixinAuthorization(accessControlState)` line MUST be placed in `main.mo`, not in a custom mixin file.

## Setup in main.mo

```motoko filepath=src/backend/main.mo
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import AccessControl "mo:caffeineai-authorization/access-control";
import MixinAuthorization "mo:caffeineai-authorization/MixinAuthorization";
import Types "types";
import ProfileMixin "mixins/Profile";

actor {
  let accessControlState = AccessControl.initState();
  include MixinAuthorization(accessControlState);

  let userProfiles = Map.empty<Principal, Types.UserProfile>();

  include ProfileMixin(accessControlState, userProfiles);
};
```

## Type Definitions in types.mo

```motoko filepath=src/backend/types.mo
module {
  public type UserProfile = {
    name : Text;
  };
};
```

## Custom Mixin Example (mixins/Profile.mo)

The frontend requires `getCallerUserProfile`, `saveCallerUserProfile`, and `getUserProfile`. Pass `accessControlState` to your mixin so it can check permissions.

```motoko filepath=src/backend/mixins/Profile.mo
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import AccessControl "mo:caffeineai-authorization/access-control";
import Types "../types";

mixin (
  accessControlState : AccessControl.AccessControlState,
  userProfiles : Map.Map<Principal, Types.UserProfile>,
) {
  public query ({ caller }) func getCallerUserProfile() : async ?Types.UserProfile {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized");
    };
    userProfiles.get(caller);
  };

  public shared ({ caller }) func saveCallerUserProfile(profile : Types.UserProfile) : async () {
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized");
    };
    userProfiles.add(caller, profile);
  };

  public query ({ caller }) func getUserProfile(user : Principal) : async ?Types.UserProfile {
    if (caller != user and not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Can only view your own profile");
    };
    userProfiles.get(user);
  };
};
```

## Guard Patterns

Apply the appropriate guard to every public function:

```
// Admin-only:
if (not AccessControl.hasPermission(accessControlState, caller, #admin)) {
  Runtime.trap("Unauthorized: Only admins can perform this action");
};

// Users only:
if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
  Runtime.trap("Unauthorized: Only users can perform this action");
};

// Any user including guests: No check needed
```

## Design Guidelines

- Anonymous principals are treated as guests.
- `assignRole` includes an admin-only guard internally.
- Use `shared({ caller })` for authenticated endpoints that modify data.
- Use `query({ caller })` for authenticated endpoints that fetch data.
- Handle ownership verification where needed.
- Use `Runtime.trap` for authorization failures.

# Frontend

Authentication system with role-based access control.

## User Profile Setup

When using Internet Identity, the user gets a principal id only after login. Anonymous principals are treated as guests. The principal id is not human-readable -- ask the user for their name the first time they log in with a new principal.

Backend API for profiles:
- `getCallerUserProfile(): Promise<UserProfile | null>` -- returns `null` if no profile exists
- `saveCallerUserProfile(profile: UserProfile): Promise<void>` -- saves name and profile data
- `getUserProfile(user: Principal): Promise<UserProfile | null>` -- fetch another user's profile

Rules:
- On login, if the user already has a profile, do not ask for the name again
- Display the user's profile name instead of the principal id
- Make sure the user must be logged in before seeing any application data
- When logging out, clear all cached application data including the cached user profile

### Preventing Profile Setup Modal Flash

```typescript
export function useGetCallerUserProfile() {
  const { actor, isFetching: actorFetching } = useActor();

  const query = useQuery<UserProfile | null>({
    queryKey: ['currentUserProfile'],
    queryFn: async () => {
      if (!actor) throw new Error('Actor not available');
      return actor.getCallerUserProfile();
    },
    enabled: !!actor && !actorFetching,
    retry: false,
  });

  return {
    ...query,
    isLoading: actorFetching || query.isLoading,
    isFetched: !!actor && query.isFetched,
  };
}
```

Then in your component:
```typescript
const showProfileSetup = isLoginSuccess && !profileLoading && isFetched && userProfile === null;
```

## Login Component

```typescript
import React from 'react';
import { useInternetIdentity } from '@caffeineai/core-infrastructure';
import { useQueryClient } from '@tanstack/react-query';

export default function LoginButton() {
  const { login, clear, isLoginSuccess, identity } = useInternetIdentity();
  const queryClient = useQueryClient();

  const isAuthenticated = !!identity;
  const disabled = !isLoginSuccess && !isAuthenticated;
  const text = !isAuthenticated && !isLoginSuccess ? 'Logging in...' : isAuthenticated ? 'Logout' : 'Login';

  const handleAuth = async () => {
    if (isAuthenticated) {
      await clear();
      queryClient.clear();
    } else {
      try {
        await login();
      } catch (error: any) {
        console.error('Login error:', error);
        if (error.message === 'User is already authenticated') {
          await clear();
          setTimeout(() => login(), 300);
        }
      }
    }
  };

  return (
    <button
      onClick={handleAuth}
      disabled={disabled}
      className={`px-6 py-2 rounded-full transition-colors font-medium ${
        isAuthenticated
          ? 'bg-gray-200 hover:bg-gray-300 text-gray-800'
          : 'bg-blue-600 hover:bg-blue-700 text-white'
      } disabled:opacity-50`}
    >
      {text}
    </button>
  );
}
```

Gate authenticated UI on `isLoginSuccess`:
```typescript
{isLoginSuccess ? (
  <AuthenticatedApp />
) : (
  <LoginScreen onLogin={handleLogin} />
)}
```

## Comparing Current User with Data Author

```typescript
import { useInternetIdentity } from '@caffeineai/core-infrastructure';
import type { Principal } from '@icp-sdk/core/principal';

const { identity } = useInternetIdentity();

const isAuthor = (authorPrincipal: Principal): boolean => {
  if (!identity) return false;
  return authorPrincipal.toString() === identity.getPrincipal().toString();
};
```

## Access Control UI

For admin-only or personal applications, show an AccessDeniedScreen component when unauthorized users try to access the application.

## Error Handling

Handle authorization errors from backend `Debug.trap` calls gracefully in the UI with appropriate error messages shown to the user.

Note: The initialization of the first admin is done automatically in `@caffeineai/core-infrastructure`. The first authenticated user to log in becomes admin; no token or secret is needed.
