import { computed, inject, Injectable, resource } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  AsyncValidatorFn,
  ValidationErrors,
} from '@angular/forms';
import { fromNullable } from '@dfinity/utils';
import { Actor } from '@icp-sdk/core/agent';
import { toast } from 'ngx-sonner';
import { catchError, map, of } from 'rxjs';

import { CreateProfileArgs, UpdateProfileArgs } from '@rabbithole/declarations/backend';

import { injectMainActor } from '../injectors/main-actor';
import { BACKEND_FEATURES_ENABLED_TOKEN } from '../tokens/backend-features';
import { parseCanisterRejectError } from '../utils/parse-canister-reject-error';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  #actor = injectMainActor();
  #backendFeaturesEnabled = inject(BACKEND_FEATURES_ENABLED_TOKEN);
  #profileResource = resource({
    params: () => ({
      actor: this.#actor(),
      enabled: this.#backendFeaturesEnabled,
    }),
    loader: async ({ params: { actor, enabled } }) => {
      if (!enabled) return null;

      const agent = Actor.agentOf(actor);
      const principal = await agent?.getPrincipal();
      if (principal?.isAnonymous()) {
        return undefined;
      }

      const profile = await actor.getProfile();
      return fromNullable(profile) ?? null;
    },
  });
  profile = computed(() => {
    if (this.#profileResource.error() !== undefined) {
      return undefined;
    }
    return this.#profileResource.value();
  });
  ready$ = toObservable(this.#profileResource.value).pipe(
    map((v) => v !== undefined),
    catchError(() => of(true)),
  );

  checkUsernameValidator(): AsyncValidatorFn {
    return async (
      control: AbstractControl<string | null>,
    ): Promise<ValidationErrors | null> => {
      const value = control.value;
      if (!value) return null;
      const actor = this.#actor();
      const exists = await actor.usernameExists(value);
      return exists ? { usernameExists: true } : null;
    };
  }

  async createProfile(args: CreateProfileArgs) {
    const id = toast.loading('Creating profile...');
    const actor = this.#actor();
    try {
      await actor.createProfile(args);
      toast.success('Profile created successfully', { id });
      this.#profileResource.reload();
    } catch (error) {
      const errorMessage =
        parseCanisterRejectError(error) ?? 'An error has occurred';
      toast.error(`Failed to create profile: ${errorMessage}`, {
        id,
      });
      throw error;
    }
  }

  async deleteProfile() {
    const id = toast.loading('Deleting profile...');
    const actor = this.#actor();
    try {
      await actor.deleteProfile();
      toast.success('Profile deleted successfully', { id });
      this.#profileResource.reload();
    } catch (error) {
      const errorMessage =
        parseCanisterRejectError(error) ?? 'An error has occurred';
      toast.error(`Failed to delete profile: ${errorMessage}`, {
        id,
      });
      throw error;
    }
  }

  async updateProfile(args: UpdateProfileArgs) {
    const id = toast.loading('Updating profile...');
    const actor = this.#actor();
    try {
      await actor.updateProfile(args);
      toast.success('Profile updated successfully', { id });
      this.#profileResource.reload();
    } catch (error) {
      const errorMessage =
        parseCanisterRejectError(error) ?? 'An error has occurred';
      toast.error(`Failed to update profile: ${errorMessage}`, {
        id,
      });
      throw error;
    }
  }
}
