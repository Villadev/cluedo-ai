import { Component } from '@angular/core';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-lobbies-page',
  standalone: true,
  imports: [CardModule],
  templateUrl: './lobbies-page.component.html',
  styleUrl: './lobbies-page.component.scss'
})
export class LobbiesPageComponent {}
