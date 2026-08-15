import { Outlet } from 'react-router-dom';

/**
 * The layout route the six HR views share.
 *
 * Deliberately empty of chrome, like the finance module's: every HR mutation
 * surfaces its own refusal inline — a payroll period that will not approve, an
 * upload over the cap, a taxable wage outside every ITS band — because those
 * are answers to a specific control the user just pressed, and a floating
 * toast would separate the message from the thing it is about.
 */
export function HrModuleChrome() {
  return <Outlet />;
}

export default HrModuleChrome;
