import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'wind-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wind-icon.html',
  styles: [':host{display:inline-flex} svg{width:1rem;height:1rem;display:block}'],
})
export class WindIcon {
  readonly name = input.required<string>();
}
