import { RouterProvider } from 'react-router-dom';

import { AppProviders } from './providers';
import { router } from './router';

/**
 * Application root: global providers wrapped around the router.
 *
 * Everything else hangs off the route table, so this file should rarely change.
 */
export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}

export default App;
