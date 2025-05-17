import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  imports: [RouterModule],
  selector: 'app-root',
  template: `<router-outlet></router-outlet>`,
})
export class AppComponent {
  // title = 'rabbithole' + import.meta.env.CANISTER_ID_INTERNET_IDENTITY;

  constructor() {
    console.log(import.meta.env);
  }
}
