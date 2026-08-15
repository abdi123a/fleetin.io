import { Outlet } from 'react-router-dom';

/**
 * The layout route every finance view shares. Real mutations surface their
 * own errors inline (see each page's error banner) rather than through a
 * shared toast — there is no shared toast system elsewhere in the app either.
 * The mock's 30-second validation clock is gone with it: no real "became
 * ready at" timestamp is tracked server-side to tick against.
 */
export function FinanceModuleChrome() {
  return <Outlet />;
}

export default FinanceModuleChrome;
