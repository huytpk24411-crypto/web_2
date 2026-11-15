import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PerspectiveCamera, Scene, SphereGeometry, Vector3, type WebGLRenderer } from 'three';
import { API_TOUR_FIXTURES, API_ROOMS } from '../../testing/api-fixtures';
import { ROOM_TOUR_FIXTURE } from '../../testing/room-tour-fixture';
import { SharedModule } from '../shared-module';
import { RoomTourComponent, TOUR_SPHERE_ROTATION_Y, tourDirection } from './room-tour';

// Exercise the fallback without depending on a GPU in the unit test environment.
vi.mock('three', async (importOriginal) => ({
  ...(await importOriginal<typeof import('three')>()),
  WebGLRenderer: class {
    constructor() {
      throw new Error('WebGL unavailable');
    }
  },
}));

describe('Quy ước hướng ảnh tour 360°', () => {
  it('đồng bộ yaw/pitch và UV mặt cầu, giữ trái/phải của ảnh', () => {
    const cases = [
      { yaw: 0, pitch: 0, expected: [0, 0, -1] },
      { yaw: 90, pitch: 0, expected: [1, 0, 0] },
      { yaw: 0, pitch: 90, expected: [0, 1, 0] },
    ];
    for (const { yaw, pitch, expected } of cases) {
      const direction = tourDirection(yaw, pitch);
      expect(direction.x).toBeCloseTo(expected[0], 10);
      expect(direction.y).toBeCloseTo(expected[1], 10);
      expect(direction.z).toBeCloseTo(expected[2], 10);
    }

    // Use the real CPU geometry and the viewer's mesh rotation; no renderer/DOM.
    const geometry = new SphereGeometry(1, 64, 40);
    try {
      geometry.scale(-1, 1, 1);
      const uv = geometry.getAttribute('uv');
      const positions = geometry.getAttribute('position');
      const axisY = new Vector3(0, 1, 0);
      for (const [u, yaw] of [
        [0.25, -90],
        [0.5, 0],
        [0.75, 90],
      ]) {
        const index = Array.from({ length: uv.count }, (_, i) => i).find(
          (i) => Math.abs(uv.getX(i) - u) < 1e-6 && Math.abs(uv.getY(i) - 0.5) < 1e-6,
        );
        expect(index).toBeDefined();
        const actual = new Vector3()
          .fromBufferAttribute(positions, index!)
          .applyAxisAngle(axisY, TOUR_SPHERE_ROTATION_Y)
          .normalize();
        const expected = tourDirection(yaw, 0);
        expect(actual.x).toBeCloseTo(expected.x, 6);
        expect(actual.y).toBeCloseTo(expected.y, 6);
        expect(actual.z).toBeCloseTo(expected.z, 6);
      }
    } finally {
      geometry.dispose();
    }
  });
});

describe('API_TOUR_FIXTURES', () => {
  it('gắn đủ bốn cảnh đúng phòng cho năm phòng HOT, không giữ tour r1', () => {
    expect(Object.keys(API_TOUR_FIXTURES).sort()).toEqual([
      'phong-46',
      'phong-47',
      'phong-48',
      'phong-49',
      'phong-50',
    ]);
    const images = new Set<string>();
    for (const [roomId, tour] of Object.entries(API_TOUR_FIXTURES)) {
      expect(API_ROOMS.some((room) => room.id === roomId && room.featured)).toBe(true);
      expect(tour.roomId).toBe(roomId);
      const ids = tour.scenes.map((scene) => scene.id);
      expect(ids).toEqual(['living', 'kitchen', 'bathroom', 'bedroom']);
      expect(new Set(ids).size).toBe(ids.length);
      expect(tour.startScene).toBe('living');
      expect(tour.pitchLimit).toBe(12);
      for (const scene of tour.scenes) {
        expect(scene.image).toBe(
          `/assets/tours/PHONG_${roomId.slice('phong-'.length)}/${scene.id}.webp`,
        );
        expect(images.has(scene.image)).toBe(false);
        images.add(scene.image);
        expect(scene.initialYaw).toBe(0);
        expect(scene.hotspots.map((hotspot) => hotspot.target).sort()).toEqual(
          scene.id === 'living' ? ['bathroom', 'bedroom', 'kitchen'] : ['living'],
        );
        for (const hotspot of scene.hotspots) {
          expect(ids).toContain(hotspot.target);
          expect(hotspot.target).not.toBe(scene.id);
          expect(hotspot.label.length).toBeGreaterThan(0);
          expect(Number.isFinite(hotspot.yaw)).toBe(true);
          expect(Math.abs(hotspot.yaw)).toBeLessThanOrEqual(180);
          expect(Number.isFinite(hotspot.pitch)).toBe(true);
          expect(Math.abs(hotspot.pitch)).toBeLessThanOrEqual(tour.pitchLimit!);
        }
      }
    }
    expect(images.size).toBe(20);
  });

  it('giữ hướng trái/phải/sau theo bố cục, bao gồm bếp Loft và phòng tắm Blue Gallery', () => {
    for (const tour of Object.values(API_TOUR_FIXTURES)) {
      const hotspots = tour.scenes.find((scene) => scene.id === 'living')!.hotspots;
      const yaw = (target: string) => hotspots.find((hotspot) => hotspot.target === target)!.yaw;
      expect(yaw('kitchen')).toBeLessThan(0);
      expect(yaw('bedroom')).toBeGreaterThan(0);
      if (['phong-48', 'phong-50'].includes(tour.roomId)) {
        expect(yaw('kitchen')).toBeLessThan(-90);
      }
      if (tour.roomId !== 'phong-47') expect(yaw('bedroom')).toBeGreaterThan(90);
      if (['phong-46', 'phong-47'].includes(tour.roomId)) {
        expect(yaw('bathroom')).toBeLessThan(-90);
      }
      if (tour.roomId === 'phong-50') expect(yaw('bathroom')).toBeGreaterThan(90);
      for (const scene of tour.scenes.filter((scene) => scene.id !== 'living')) {
        const back = scene.hotspots.find((hotspot) => hotspot.target === 'living')!;
        if (tour.roomId === 'phong-49' && scene.id === 'kitchen') {
          expect(back.yaw).toBeGreaterThan(0);
          expect(back.yaw).toBeLessThan(90);
        } else {
          expect(Math.abs(back.yaw)).toBe(180);
        }
      }
    }
  });
});

describe('RoomTourComponent', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    await TestBed.configureTestingModule({ imports: [SharedModule] }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('hiện thông báo khi không có WebGL, đóng bằng Esc và khôi phục cuộn/focus', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    const fixture = TestBed.createComponent(RoomTourComponent);
    fixture.componentInstance.tour = structuredClone(ROOM_TOUR_FIXTURE);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    try {
      fixture.detectChanges();
      await vi.waitFor(() => expect(fixture.componentInstance.unavailable()).toContain('WebGL'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('WebGL');
      expect(document.body.style.overflow).toBe('hidden');
      expect(document.documentElement.style.overflow).toBe('hidden');
      fixture.nativeElement
        .querySelector('[role="dialog"]')
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(closed).toHaveBeenCalledOnce();
    } finally {
      fixture.destroy();
      expect(document.body.style.overflow).toBe(bodyOverflow);
      expect(document.documentElement.style.overflow).toBe(rootOverflow);
      expect(document.activeElement).toBe(opener);
      opener.remove();
    }
  });

  it('giới hạn zoom trong 40–90 và nút đóng phát sự kiện', () => {
    const fixture = TestBed.createComponent(RoomTourComponent);
    fixture.componentInstance.tour = structuredClone(ROOM_TOUR_FIXTURE);
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges();
    fixture.componentInstance.zoom(-100);
    expect(fixture.componentInstance.fov()).toBe(40);
    fixture.componentInstance.zoom(100);
    expect(fixture.componentInstance.fov()).toBe(90);
    fixture.componentInstance.resetView();
    expect(fixture.componentInstance.fov()).toBe(75);
    fixture.nativeElement.querySelector('.close').click();
    expect(closed).toHaveBeenCalledOnce();
    fixture.destroy();
  });

  it.each([
    { pitchLimit: undefined, expectedPitch: 85, expectedFov: 90 },
    { pitchLimit: 12, expectedPitch: 12, expectedFov: 75 },
  ])(
    'kẹp góc khi kéo/phím và zoom với pitchLimit=$pitchLimit',
    ({ pitchLimit, expectedPitch, expectedFov }) => {
      const fixture = TestBed.createComponent(RoomTourComponent);
      const component = fixture.componentInstance;
      component.tour = { ...structuredClone(ROOM_TOUR_FIXTURE), pitchLimit };
      fixture.detectChanges();
      try {
        const canvas = component.canvas.nativeElement;
        canvas.setPointerCapture = vi.fn();
        canvas.hasPointerCapture = vi.fn(() => false);
        const pointer = {
          pointerId: 1,
          isPrimary: true,
          button: 0,
          clientX: 0,
          clientY: 0,
          timeStamp: 0,
        };
        component.pointerDown(pointer as PointerEvent);
        component.pointerMove({ ...pointer, clientY: 10000, timeStamp: 20 } as PointerEvent);
        expect(component['pitch']).toBe(expectedPitch);
        component.pointerMove({ ...pointer, clientY: -10000, timeStamp: 40 } as PointerEvent);
        expect(component['pitch']).toBe(-expectedPitch);
        component.pointerUp({ ...pointer, timeStamp: 50 } as PointerEvent);

        const key = (name: string) =>
          canvas.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
        for (let i = 0; i < 50; i++) key('ArrowUp');
        expect(component['pitch']).toBe(expectedPitch);
        for (let i = 0; i < 50; i++) key('ArrowDown');
        expect(component['pitch']).toBe(-expectedPitch);
        for (let i = 0; i < 30; i++) key('-');
        expect(component.fov()).toBe(expectedFov);
        component.zoom(-1000);
        expect(component.fov()).toBe(40);
        component.resetView();
        expect(component['pitch']).toBe(0);
        expect(component.fov()).toBe(75);
      } finally {
        fixture.destroy();
      }
    },
  );

  it('kẹp cả quán tính ở +/-12°, không cho vượt giới hạn sau khi thả chuột', () => {
    const fixture = TestBed.createComponent(RoomTourComponent);
    const component = fixture.componentInstance;
    component.tour = structuredClone(API_TOUR_FIXTURES['phong-46']);
    fixture.detectChanges();
    const frame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
    try {
      component['renderer'] = {
        render: vi.fn(),
        dispose: vi.fn(),
        forceContextLoss: vi.fn(),
      } as unknown as WebGLRenderer;
      component['camera'] = new PerspectiveCamera(75, 1, 0.1, 1100);
      component['world'] = new Scene();
      component['point'] = new Vector3();
      component['reducedMotion'] = false;
      component.activeScene.set(component.tour.scenes[0]);
      component.loading.set(false);
      component.interact();
      component['animate'](1000);
      component['velocityPitch'] = 10000;
      component['animate'](1050);
      expect(component['pitch']).toBe(12);
      component['velocityPitch'] = -10000;
      component['animate'](1100);
      expect(component['pitch']).toBe(-12);
    } finally {
      frame.mockRestore();
      fixture.destroy();
    }
  });

  it('hiện đúng một ghi chú cho tour giới hạn góc nhìn và khóa thu nhỏ tại FOV 75°', () => {
    const fixture = TestBed.createComponent(RoomTourComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('tour', structuredClone(API_TOUR_FIXTURES['phong-46']));
    fixture.detectChanges();
    try {
      component.activeScene.set(component.tour.scenes[0]);
      component.loading.set(false);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.tour-note')).toHaveLength(1);
      expect(fixture.nativeElement.querySelector('.tour-note').textContent.trim()).toBe(
        'Ảnh mô phỏng 360° dựng từ ảnh góc chụp',
      );
      const zoomOut = fixture.nativeElement.querySelector('button[aria-label="Thu nhỏ"]');
      expect(zoomOut.disabled).toBe(true);
      component.zoom(-5);
      fixture.detectChanges();
      expect(zoomOut.disabled).toBe(false);
      // Use Angular input binding so changing tour marks the view for checking.
      fixture.componentRef.setInput('tour', structuredClone(ROOM_TOUR_FIXTURE));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.tour-note')).toBeNull();
      expect(zoomOut.disabled).toBe(false);
    } finally {
      fixture.destroy();
    }
  });
});
