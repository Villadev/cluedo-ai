import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Failed to bootstrap player UI';
  console.error(message);
});
