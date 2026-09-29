import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Route, Switch, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import AccountPage from '@/pages/account';
import { AdminSalon, AdminServices, AdminTeam } from '@/pages/admin-manage';
import Home from '@/pages/home';
import LoginPage from '@/pages/login';
import BookingLookup from '@/pages/lookup';
import NotFound from '@/pages/not-found';
import { AdminDashboard, StaffDashboard } from '@/pages/staff';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function Router() {
  return (
    <ErrorBoundary resetKey={window.location.pathname}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/meu-agendamento" component={BookingLookup} />
        <Route path="/meu-agendamento/:code" component={BookingLookup} />
        <Route path="/entrar" component={LoginPage} />
        <Route path="/sign-in/*?">{() => <Redirect to="/entrar" replace />}</Route>
        <Route path="/equipe" component={StaffDashboard} />
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/servicos" component={AdminServices} />
        <Route path="/admin/equipe" component={AdminTeam} />
        <Route path="/admin/salao" component={AdminSalon} />
        <Route path="/conta" component={AccountPage} />
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
