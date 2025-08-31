import {
  Outlet,
  createRouter,
  createRoute,
  createRootRoute,
} from '@tanstack/react-router'
import { withPageErrorBoundary } from "@/src/lib/components/errors/PageErrorBoundary";
import HomePage from "./landing";
import { useAnalytics } from '../lib/hooks/use-analytics';
import FaucetPage from './faucet';
import DocsPage from './docs';
import TermsPage from './terms';

const rootRoute = createRootRoute({
  component: () => {
    useAnalytics();

    return (
      <>
        <Outlet />
      </>
    )
  },
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: function Index() {
    return withPageErrorBoundary(HomePage)({});
  },
})

const faucetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/faucet',
  component: function Faucet() {
    return withPageErrorBoundary(FaucetPage)({});
  },
})

const docsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/docs',
  component: function Docs() {
    return withPageErrorBoundary(DocsPage)({});
  },
})

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/terms',
  component: function Terms() {
    return withPageErrorBoundary(TermsPage)({});
  },
})


const routeTree = rootRoute.addChildren([indexRoute, faucetRoute, docsRoute, termsRoute])
const router = createRouter({
  routeTree,
})
  
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export default router;