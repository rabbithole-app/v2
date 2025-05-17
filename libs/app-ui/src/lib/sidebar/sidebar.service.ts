import { effect, Injectable, signal, untracked } from '@angular/core';
import { BrnDialogState } from '@spartan-ng/brain/dialog';

import { injectIsMobile } from './utils';

type State = {
  isOpen: boolean;
  sheetState: BrnDialogState;
};

const SIDEBAR_STORAGE_KEY = 'rabbithole:sidebar_state';

function getInitialState(): State {
  const isOpenRaw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
  const isOpen = isOpenRaw ? JSON.parse(isOpenRaw) : true;
  return {
    isOpen,
    sheetState: 'closed',
  };
}

const INITIAL_VALUE: State = getInitialState();

@Injectable()
export class SidebarService {
  #state = signal(INITIAL_VALUE);
  state = this.#state.asReadonly();
  #isMobile = injectIsMobile();

  constructor() {
    effect(() =>
      localStorage.setItem(
        SIDEBAR_STORAGE_KEY,
        JSON.stringify(this.#state().isOpen)
      )
    );
    effect(() => {
      const isMobile = this.#isMobile();
      const sheetState = untracked(() => this.state().sheetState);
      if (!isMobile && sheetState === 'open') {
        this.setSheetState('closed');
      }
    });
  }

  setSheetState(sheetState: BrnDialogState) {
    this.#state.update((state) => ({
      ...state,
      sheetState,
    }));
  }

  toggle() {
    if (this.#isMobile()) {
      this.#toggleMobile();
    } else {
      this.#toggle();
    }
  }

  #toggle() {
    this.#state.update((state) => {
      const isOpen = !state.isOpen;
      return { ...state, isOpen, state: isOpen ? 'expanded' : 'collapsed' };
    });
  }

  #toggleMobile() {
    this.#state.update((state) => ({
      ...state,
      sheetState: state.sheetState === 'open' ? 'closed' : 'open',
    }));
  }
}
