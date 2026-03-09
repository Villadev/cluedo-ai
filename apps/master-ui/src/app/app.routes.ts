import { Routes } from '@angular/router';
import { DashboardPageComponent } from './pages/dashboard/dashboard-page.component';
import { LobbiesPageComponent } from './pages/lobbies/lobbies-page.component';
import { ModerationPageComponent } from './pages/moderation/moderation-page.component';
import { SettingsPageComponent } from './pages/settings/settings-page.component';
import { ControlCenterComponent } from './features/control-center/control-center.component';

export const appRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', component: DashboardPageComponent },
  { path: 'lobbies', component: LobbiesPageComponent },
  { path: 'moderation', component: ModerationPageComponent },
  { path: 'settings', component: SettingsPageComponent },
  { path: 'control-center', component: ControlCenterComponent }
];
