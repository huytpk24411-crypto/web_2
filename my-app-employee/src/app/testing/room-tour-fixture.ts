import { RoomTour } from '../classes/RoomTour';

// A viewer fixture is independent of the production tour registry and media files.
export const ROOM_TOUR_FIXTURE: RoomTour = {
  roomId: 'phong-48',
  startScene: 'living',
  scenes: ['living', 'bedroom', 'kitchen', 'bathroom'].map((id) => ({
    id,
    label: id,
    image: '/assets/placeholders/room-placeholder.svg',
    hotspots: [
      { target: id === 'living' ? 'bedroom' : 'living', label: 'Chuyển cảnh', yaw: 0, pitch: 0 },
    ],
  })),
};
