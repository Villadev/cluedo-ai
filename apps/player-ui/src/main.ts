import { provideHttpClient } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { appRoutes } from './app/app.routes';

bootstrapApplication(AppComponent, {
  providers: [provideAnimations(), provideRouter(appRoutes), provideHttpClient()]
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'No s\'ha pogut inicialitzar la interfície de jugador';
  console.error(message);
});
