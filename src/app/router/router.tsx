import { createBrowserRouter } from 'react-router-dom';

import { routes } from './routes';

/**
 * Application router.
 *
 * Created once at module scope — recreating it on render would remount the
 * whole tree on every state change.
 */
export const router = createBrowserRouter(routes);
