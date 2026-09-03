import * as Actions from './actions';
import * as Communication from './communication';
import * as Documents from './documents';
import * as Finance from './finance';
import * as Navigation from './navigation';
import * as Operations from './operations';
import * as Status from './status';
import * as Ui from './ui';
import * as Users from './users';

export { SemiTruck } from './SemiTruck';
export * from './types';
export * from './guidelines';

export * from './navigation';
export * from './operations';
export * from './users';
export * from './documents';
export * from './finance';
export * from './communication';
export * from './status';
export * from './actions';
export * from './ui';

export const Icons = {
  ...Navigation.NavigationIcons,
  ...Operations.OperationsIcons,
  ...Users.UsersIcons,
  ...Documents.DocumentsIcons,
  ...Finance.FinanceIcons,
  ...Communication.CommunicationIcons,
  ...Status.StatusIcons,
  ...Actions.ActionsIcons,
  ...Ui.UiIcons,
};
