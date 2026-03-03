import { Component } from '@angular/core';

@Component({
  selector: 'ui-card',
  standalone: true,
  template: `
    <article class="ui-surface glass p-5 sm:p-6">
      <ng-content />
    </article>
  `
})
export class UiCardComponent {}
