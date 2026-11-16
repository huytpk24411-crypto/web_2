export interface TourScene {
  id: string;
  label: string;
  image: string;
  initialYaw?: number;
  hotspots: { target: string; label: string; yaw: number; pitch: number }[];
}

export interface RoomTour {
  roomId: string;
  startScene: string;
  // Simulated reconstructions declare their vertical limit and use a maximum FOV of 75°.
  // Omit for real panoramas (pitch +/-85°, maximum FOV 90°).
  pitchLimit?: number;
  scenes: TourScene[];
}
