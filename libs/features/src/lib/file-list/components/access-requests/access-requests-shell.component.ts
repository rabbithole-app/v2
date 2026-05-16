import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import type { StorageAccessRequest } from '@rabbithole/encrypted-storage';

import { AccessRequestsNoRequestsComponent } from './access-requests-no-requests.component';
import { AccessRequestsPageComponent } from './access-requests-page.component';
import { AccessRequestsStore } from './access-requests.store';

@Component({
  selector: 'rbth-feat-access-requests-shell',
  template: `
    @if (store.sortedRequests().length === 0) {
      <rbth-feat-access-requests-no-requests />
    } @else {
      <rbth-feat-access-requests-page />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [AccessRequestsNoRequestsComponent, AccessRequestsPageComponent],
  providers: [AccessRequestsStore, DatePipe],
})
export class AccessRequestsShellComponent implements OnInit {
  readonly store = inject(AccessRequestsStore);
  readonly #route = inject(ActivatedRoute);

  ngOnInit(): void {
    this.store.setRequests(
      this.#route.snapshot.data['accessRequests'] as StorageAccessRequest[],
    );
  }
}
