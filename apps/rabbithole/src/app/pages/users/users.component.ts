import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import { UsersTableComponent } from '@rabbithole/core';

import { UsersService } from './users.service';

@Component({
  selector: 'app-users',
  imports: [UsersTableComponent],
  templateUrl: './users.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersComponent {
  // Current pagination and search state
  currentPageIndex = signal(0);

  currentPageSize = signal(10);
  usersService = inject(UsersService);

  loading = computed(() => this.usersService.list.isLoading());

  profiles = computed(() => this.usersService.list.value()?.data || []);

  get totalCount(): number {
    return this.usersService.list.value()?.count || 0;
  }

  onPageChange(event: { pageIndex: number; pageSize: number }) {
    // Update local state
    this.currentPageIndex.set(event.pageIndex);
    this.currentPageSize.set(event.pageSize);

    // Update pagination options in the service
    const currentOptions = this.usersService.state().options;
    const newOptions = {
      ...currentOptions,
      pagination: {
        offset: BigInt(event.pageIndex * event.pageSize),
        limit: BigInt(event.pageSize),
      },
    };
    this.usersService.setOptions(newOptions);
  }
}
