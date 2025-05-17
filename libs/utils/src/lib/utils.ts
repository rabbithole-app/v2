import { UnlistenFn } from '@tauri-apps/api/event';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { from, Observable } from 'rxjs';

export const isTauri = () => '__TAURI_INTERNALS__' in window;

export type Urls = Parameters<Parameters<typeof onOpenUrl>[0]>[0];

export function onOpenUrlObservable() {
  return new Observable<Urls>((subscriber) => {
    let unlisten: UnlistenFn | null = null;
    const subscription = from(
      onOpenUrl((urls) => subscriber.next(urls))
    ).subscribe({
      error: (err) => subscriber.error(err),
      next: (unlistenFn) => {
        unlisten = unlistenFn;
      },
    });
    return () => {
      if (unlisten) unlisten();
      subscription.unsubscribe();
    };
  });
}
