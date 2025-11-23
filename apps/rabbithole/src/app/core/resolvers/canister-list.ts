import { ResolveFn } from '@angular/router';
import { Principal } from '@dfinity/principal';
import { of } from 'rxjs';

export const canisterListResolver: ResolveFn<Principal[]> = () => {
  // Hardcoded list of canisters
  const canisterIds: Principal[] = [
    Principal.fromText('uxrrr-q7777-77774-qaaaq-cai'),
    Principal.fromText('ulvla-h7777-77774-qaacq-cai'),
  ];

  return of(canisterIds);
};
