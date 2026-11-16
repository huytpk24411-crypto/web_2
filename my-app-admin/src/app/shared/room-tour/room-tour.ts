import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  QueryList,
  ViewChild,
  ViewChildren,
  inject,
  signal,
} from '@angular/core';
import type {
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomTour, TourScene } from '../../classes/RoomTour';

// After scale(-1, 1, 1), u=0.5 points toward -X. Rotate -90° about Y
// to put it at -Z, with increasing u pointing right (+X) at the image center.
export const TOUR_SPHERE_ROTATION_Y = -Math.PI / 2;

export function tourDirection(yaw: number, pitch: number) {
  const y = (yaw * Math.PI) / 180;
  const p = (pitch * Math.PI) / 180;
  return {
    x: Math.sin(y) * Math.cos(p),
    y: Math.sin(p),
    z: -Math.cos(y) * Math.cos(p),
  };
}

@Component({
  selector: 'app-room-tour',
  standalone: false,
  templateUrl: './room-tour.html',
  styleUrls: ['./room-tour.css'],
})
export class RoomTourComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) tour!: RoomTour;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('viewport', { static: true }) viewport!: ElementRef<HTMLElement>;
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  @ViewChildren('hotspot') hotspotButtons!: QueryList<ElementRef<HTMLButtonElement>>;

  activeScene = signal<TourScene | undefined>(undefined);
  loading = signal(true);
  error = signal('');
  unavailable = signal('');
  transitioning = signal(false);
  dragged = signal(false);
  fov = signal(60);

  get simulated() {
    return this.tour.pitchLimit !== undefined;
  }

  get maxFov() {
    return this.simulated ? 75 : 90;
  }

  private clampPitch(pitch: number) {
    const limit = Math.max(0, Math.min(85, this.tour.pitchLimit ?? 85));
    return Math.max(-limit, Math.min(limit, pitch));
  }

  private zone = inject(NgZone);
  private three?: typeof import('three');
  private renderer?: WebGLRenderer;
  private world?: Scene;
  private camera?: PerspectiveCamera;
  private geometry?: SphereGeometry;
  private material?: MeshBasicMaterial;
  private point?: Vector3;
  private observer?: ResizeObserver;
  private motion?: MediaQueryList;
  private reducedMotion = false;
  private destroyed = false;
  private frame = 0;
  private lastFrame = 0;
  private request = 0;
  private requestedScene = '';
  private yaw = 0;
  private pitch = 0;
  private velocityYaw = 0;
  private velocityPitch = 0;
  private pointer?: { id: number; x: number; y: number; distance: number; time: number };
  private width = 1;
  private height = 1;
  private previousOverflow = '';
  private previousRootOverflow = '';
  private textures = new Set<Texture>();
  private textureCache = new Map<string, Promise<Texture>>();
  private pending?: { scene: TourScene; texture: Texture; start: number; applied: boolean };

  ngAfterViewInit() {
    this.previousOverflow = document.body.style.overflow;
    this.previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = this.motion.matches;
    this.motion.addEventListener('change', this.motionChanged);
    this.zone.runOutsideAngular(() => void this.initialize());
  }

  private async initialize() {
    try {
      // Keep all runtime Three.js code in its own lazy chunk.
      const three = await import('three');
      if (this.destroyed) return;
      this.three = three;
      this.renderer = new three.WebGLRenderer({
        canvas: this.canvas.nativeElement,
        antialias: true,
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = three.SRGBColorSpace;
      this.world = new three.Scene();
      this.camera = new three.PerspectiveCamera(this.fov(), 1, 0.1, 1100);
      this.geometry = new three.SphereGeometry(500, 64, 40);
      this.geometry.scale(-1, 1, 1);
      this.material = new three.MeshBasicMaterial();
      const panorama = new three.Mesh(this.geometry, this.material);
      panorama.rotation.y = TOUR_SPHERE_ROTATION_Y;
      this.world.add(panorama);
      this.point = new three.Vector3();
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(this.viewport.nativeElement);
      this.resize();
      this.canvas.nativeElement.addEventListener('wheel', this.wheel, { passive: false });
      this.canvas.nativeElement.addEventListener('webglcontextlost', this.contextLost);
      this.frame = requestAnimationFrame(this.animate);
      void this.selectScene(this.tour.startScene, false);
    } catch {
      if (!this.destroyed) {
        this.loading.set(false);
        this.unavailable.set(
          'Trình duyệt không hỗ trợ WebGL hoặc không thể khởi tạo trình xem 360°. Hãy thử trình duyệt khác.',
        );
      }
    }
  }

  private motionChanged = (event: MediaQueryListEvent) => {
    this.reducedMotion = event.matches;
    this.stopInertia();
  };

  private contextLost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(this.frame);
    this.loading.set(false);
    this.unavailable.set('Kết nối WebGL đã bị gián đoạn. Đóng và mở lại trình xem để thử lại.');
  };

  private resize() {
    if (!this.renderer || !this.camera) return;
    this.width = Math.max(1, this.viewport.nativeElement.clientWidth);
    this.height = Math.max(1, this.viewport.nativeElement.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  private loadTexture(scene: TourScene): Promise<Texture> {
    const cached = this.textureCache.get(scene.id);
    if (cached) return cached;
    const three = this.three!;
    const promise = new Promise<Texture>((resolve, reject) => {
      const texture = new three.TextureLoader().load(
        scene.image,
        (texture) => {
          if (this.destroyed) {
            texture.dispose();
            reject(new Error('Tour closed'));
            return;
          }
          texture.colorSpace = three.SRGBColorSpace;
          // Sample continuously across longitude 180° instead of clamping each edge.
          texture.wrapS = three.RepeatWrapping;
          texture.anisotropy = Math.min(8, this.renderer?.capabilities.getMaxAnisotropy() ?? 1);
          resolve(texture);
        },
        undefined,
        (error) => {
          texture.dispose();
          this.textures.delete(texture);
          reject(error);
        },
      );
      // Track pending textures too, so closing during a download disposes them immediately.
      this.textures.add(texture);
    });
    this.textureCache.set(scene.id, promise);
    void promise.catch(() => this.textureCache.delete(scene.id));
    return promise;
  }

  async selectScene(id: string, userInteraction = true) {
    if (userInteraction) this.interact();
    const scene = this.tour.scenes.find((item) => item.id === id);
    if (!scene || !this.three || this.destroyed || this.unavailable()) return;
    const request = ++this.request;
    this.requestedScene = id;
    this.pending = undefined;
    this.canvas.nativeElement.style.opacity = '1';
    this.transitioning.set(false);
    this.loading.set(true);
    this.error.set('');
    this.stopInertia();
    try {
      const texture = await this.loadTexture(scene);
      if (this.destroyed || request !== this.request || this.unavailable()) return;
      if (!this.activeScene() || this.reducedMotion) {
        this.applyScene(scene, texture);
      } else {
        this.transitioning.set(true);
        this.pending = { scene, texture, start: performance.now(), applied: false };
      }
    } catch {
      if (!this.destroyed && request === this.request) {
        this.loading.set(false);
        this.error.set(
          'Không tải được ảnh ' + scene.label + '. Vui lòng thử lại hoặc chọn cảnh khác.',
        );
      }
    }
  }

  retry() {
    void this.selectScene(this.requestedScene || this.tour.startScene);
  }

  private applyScene(scene: TourScene, texture: Texture) {
    this.material!.map = texture;
    this.material!.needsUpdate = true;
    this.activeScene.set(scene);
    this.yaw = scene.initialYaw ?? 0;
    this.pitch = 0;
    this.stopInertia();
    this.loading.set(false);
    for (const hotspot of scene.hotspots) {
      const adjacent = this.tour.scenes.find((item) => item.id === hotspot.target);
      if (adjacent) void this.loadTexture(adjacent).catch(() => undefined);
    }
  }

  private animate = (time: number) => {
    if (this.destroyed || !this.renderer || !this.camera || !this.world || this.unavailable())
      return;
    const dt = this.lastFrame ? Math.min((time - this.lastFrame) / 1000, 0.05) : 0;
    this.lastFrame = time;
    if (this.pending) {
      const pending = this.pending;
      const progress = this.reducedMotion ? 2 : (time - pending.start) / 120;
      if (progress >= 1 && !pending.applied) {
        this.applyScene(pending.scene, pending.texture);
        pending.applied = true;
      }
      this.canvas.nativeElement.style.opacity = String(Math.min(1, Math.abs(1 - progress)));
      if (progress >= 2) {
        this.canvas.nativeElement.style.opacity = '1';
        this.pending = undefined;
        this.transitioning.set(false);
      }
    }
    if (this.activeScene() && !this.reducedMotion && !this.loading() && !this.transitioning()) {
      if (!this.pointer) {
        this.yaw += this.velocityYaw * dt;
        this.pitch += this.velocityPitch * dt;
        this.velocityYaw *= Math.exp(-6 * dt);
        this.velocityPitch *= Math.exp(-6 * dt);
      }
    }
    this.pitch = this.clampPitch(this.pitch);
    this.yaw %= 360;
    this.direction(this.yaw, this.pitch);
    this.camera.lookAt(this.point!);
    this.camera.updateMatrixWorld();
    this.renderer.render(this.world, this.camera);
    this.projectHotspots();
    this.frame = requestAnimationFrame(this.animate);
  };

  private direction(yaw: number, pitch: number) {
    const direction = tourDirection(yaw, pitch);
    this.point!.set(direction.x, direction.y, direction.z);
  }

  private projectHotspots() {
    const scene = this.activeScene();
    if (!scene || !this.point || !this.camera) return;
    this.hotspotButtons.forEach((ref) => {
      const button = ref.nativeElement;
      const hotspot = scene.hotspots.find((item) => item.target === button.dataset['target']);
      let visible = false;
      if (hotspot && !this.loading() && !this.error() && !this.transitioning()) {
        this.direction(hotspot.yaw, hotspot.pitch);
        this.point!.applyMatrix4(this.camera!.matrixWorldInverse);
        if (this.point!.z < 0) {
          this.point!.applyMatrix4(this.camera!.projectionMatrix);
          visible = Math.abs(this.point!.x) < 0.9 && Math.abs(this.point!.y) < 0.85;
          if (visible) {
            button.style.left = ((this.point!.x + 1) * this.width) / 2 + 'px';
            button.style.top = ((1 - this.point!.y) * this.height) / 2 + 'px';
          }
        }
      }
      if (!visible && document.activeElement === button) this.canvas.nativeElement.focus();
      button.hidden = !visible;
      // Exclude hidden hotspots from the existing focus trap's enabled-button query.
      button.disabled = !visible;
    });
  }

  interact() {
    this.stopInertia();
  }

  private stopInertia() {
    this.velocityYaw = 0;
    this.velocityPitch = 0;
  }

  pointerDown(event: PointerEvent) {
    if (this.pointer || !event.isPrimary || event.button !== 0) return;
    this.interact();
    this.canvas.nativeElement.focus();
    this.pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      distance: 0,
      time: event.timeStamp,
    };
    this.canvas.nativeElement.setPointerCapture(event.pointerId);
    this.canvas.nativeElement.classList.add('dragging');
  }

  pointerMove(event: PointerEvent) {
    if (!this.pointer || this.pointer.id !== event.pointerId) return;
    const dx = event.clientX - this.pointer.x;
    const dy = event.clientY - this.pointer.y;
    const dt = Math.max(8, event.timeStamp - this.pointer.time) / 1000;
    this.yaw -= dx * 0.15;
    this.pitch = this.clampPitch(this.pitch + dy * 0.15);
    this.velocityYaw = this.reducedMotion ? 0 : Math.max(-120, Math.min(120, (-dx * 0.15) / dt));
    this.velocityPitch = this.reducedMotion ? 0 : Math.max(-120, Math.min(120, (dy * 0.15) / dt));
    this.pointer.distance += Math.abs(dx) + Math.abs(dy);
    if (this.pointer.distance > 3) this.dragged.set(true);
    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;
    this.pointer.time = event.timeStamp;
  }

  pointerUp(event: PointerEvent) {
    if (!this.pointer || this.pointer.id !== event.pointerId) return;
    if (event.type === 'pointercancel' || event.timeStamp - this.pointer.time > 100)
      this.stopInertia();
    this.pointer = undefined;
    const canvas = this.canvas.nativeElement;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    canvas.classList.remove('dragging');
  }

  private wheel = (event: WheelEvent) => {
    event.preventDefault();
    this.zoom(event.deltaY > 0 ? 3 : -3);
  };

  zoom(amount: number) {
    this.interact();
    this.fov.set(Math.max(40, Math.min(this.maxFov, this.fov() + amount)));
    if (this.camera) {
      this.camera.fov = this.fov();
      this.camera.updateProjectionMatrix();
    }
  }

  resetView() {
    this.interact();
    this.yaw = this.activeScene()?.initialYaw ?? 0;
    this.pitch = 0;
    this.zoom(60 - this.fov());
  }

  keydown(event: KeyboardEvent) {
    this.interact();
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closed.emit();
      return;
    }
    // Arrow keys on scene tabs retain their tab-navigation behavior.
    if ((event.target as HTMLElement).getAttribute('role') === 'tab') return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '='].includes(event.key))
      return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') this.yaw -= 5;
    if (event.key === 'ArrowRight') this.yaw += 5;
    if (event.key === 'ArrowUp') this.pitch = this.clampPitch(this.pitch + 5);
    if (event.key === 'ArrowDown') this.pitch = this.clampPitch(this.pitch - 5);
    if (event.key === '+' || event.key === '=') this.zoom(-5);
    if (event.key === '-') this.zoom(5);
  }

  tabKeydown(event: KeyboardEvent, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % this.tour.scenes.length;
    else if (event.key === 'ArrowLeft')
      next = (index - 1 + this.tour.scenes.length) % this.tour.scenes.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = this.tour.scenes.length - 1;
    else return;
    event.preventDefault();
    const buttons = (
      event.currentTarget as HTMLElement
    ).parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons[next].focus();
    void this.selectScene(this.tour.scenes[next].id);
  }

  ngOnDestroy() {
    this.destroyed = true;
    ++this.request;
    cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.motion?.removeEventListener('change', this.motionChanged);
    const canvas = this.canvas.nativeElement;
    canvas.removeEventListener('wheel', this.wheel);
    canvas.removeEventListener('webglcontextlost', this.contextLost);
    if (this.pointer && canvas.hasPointerCapture(this.pointer.id))
      canvas.releasePointerCapture(this.pointer.id);
    this.pointer = undefined;
    this.pending = undefined;
    this.textures.forEach((texture) => texture.dispose());
    this.textures.clear();
    this.textureCache.clear();
    this.geometry?.dispose();
    this.material?.dispose();
    this.world?.clear();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    document.body.style.overflow = this.previousOverflow;
    document.documentElement.style.overflow = this.previousRootOverflow;
  }
}
