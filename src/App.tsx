import { CurioProvider, useCurio } from '@/state/store';
import { Shell } from '@/ui/components/Shell';
import { Onboarding } from '@/ui/screens/Onboarding';
import { Upload } from '@/ui/screens/Upload';
import { Ingesting } from '@/ui/screens/Ingesting';
import { Chapters } from '@/ui/screens/Chapters';
import { Chat } from '@/ui/screens/Chat';
import { Settings } from '@/ui/screens/Settings';
import { Assessment } from '@/ui/screens/Assessment';
import { Results } from '@/ui/screens/Results';
import { Dashboard } from '@/ui/screens/Dashboard';
import { Review } from '@/ui/screens/Review';
import { ErrorBoundary } from '@/ui/components/ErrorBoundary';

function Router(): JSX.Element {
  const { screen, openSettings, banner } = useCurio();

  // Settings has its own back affordance; other screens show the gear.
  const showGear = screen === 'upload' || screen === 'chat';

  return (
    <Shell onSettings={showGear ? openSettings : undefined} banner={banner}>
      {screen === 'loading' && <div className="text-sm text-ink-3">Loading…</div>}
      {screen === 'onboarding' && <Onboarding />}
      {screen === 'upload' && <Upload />}
      {screen === 'ingesting' && <Ingesting />}
      {screen === 'chapters' && <Chapters />}
      {screen === 'chat' && <Chat />}
      {screen === 'assessment' && <Assessment />}
      {screen === 'results' && <Results />}
      {screen === 'settings' && <Settings />}
      {screen === 'dashboard' && <Dashboard />}
      {screen === 'review' && <Review />}
    </Shell>
  );
}

export function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <CurioProvider>
        <Router />
      </CurioProvider>
    </ErrorBoundary>
  );
}
