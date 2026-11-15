import { ApiTask } from './ShiftApi';

export interface Task {
  id: string;
  title: string;
  kind?: ApiTask['kind'];
  description?: string;
  mine?: ApiTask['mine'];
  editable?: boolean;
  returnedToAdmin?: boolean;
  viewing?: ApiTask['viewing'];
  employeeShiftIds: string[];
  assigneeIds: string[];
  doneBy: string[];
  status: ApiTask['status'];
  carriedFrom?: string;
}
