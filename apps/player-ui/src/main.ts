import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { appRoutes } from './app/app.routes';

bootstrapApplication(AppComponent, {
  providers: [provideAnimations(), provideRouter(appRoutes)]
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Failed to bootstrap player UI';
  console.error(message);
});
