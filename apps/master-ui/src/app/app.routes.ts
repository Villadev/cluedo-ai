import { Routes } from '@angular/router';
import { DashboardPageComponent } from './pages/dashboard/dashboard-page.component';
import { LobbiesPageComponent } from './pages/lobbies/lobbies-page.component';
import { ModerationPageComponent } from './pages/moderation/moderation-page.component';
import { SettingsPageComponent } from './pages/settings/settings-page.component';
import { ControlCenterComponent } from './features/control-center/control-center.component';
import { ParticipantsComponent } from './features/participants/participants.component';
import { InstructionsComponent } from './features/instructions/instructions.component';
import { IntroductionComponent } from './features/introduction/introduction.component';
import { SolutionComponent } from './features/solution/solution.component';
import { DebugPageComponent } from './pages/debug/debug-page.component';
import { TimelinePageComponent } from './pages/timeline/timeline-page.component';
import { QuestionsPageComponent } from './pages/questions/questions-page.component';
import { authGuard } from './guards/auth.guard';

export const appRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'control-center' },
  { path: 'dashboard', component: DashboardPageComponent },
  { path: 'lobbies', component: LobbiesPageComponent },
  { path: 'moderation', component: ModerationPageComponent },
  { path: 'settings', component: SettingsPageComponent },
  { path: 'control-center', component: ControlCenterComponent },
  { path: 'participants', component: ParticipantsComponent, canActivate: [authGuard] },
  { path: 'instructions', component: InstructionsComponent, canActivate: [authGuard] },
  { path: 'introduction', component: IntroductionComponent, canActivate: [authGuard] },
  { path: 'solution', component: SolutionComponent, canActivate: [authGuard] },
  { path: 'debug', component: DebugPageComponent, canActivate: [authGuard] },
  { path: 'timeline', component: TimelinePageComponent, canActivate: [authGuard] },
  { path: 'questions', component: QuestionsPageComponent, canActivate: [authGuard] }
];
