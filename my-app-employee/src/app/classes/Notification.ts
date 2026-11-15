export interface Notification {
  id: string;
  roomSnapshots?: import('./Room').RoomSnapshot[];
  accountId: string;
  type: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}
