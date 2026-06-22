import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { YouTubePlayer } from '@angular/youtube-player';

const DEMO_VIDEO_ID = 'A0ZLQGm2Au0';
const MIN_PLAYER_WIDTH = 320;
const YOUTUBE_PLAYER_STATE = {
  ENDED: 0,
  PAUSED: 2,
  PLAYING: 1,
} as const;

@Component({
  selector: 'app-demo-video-dialog',
  imports: [YouTubePlayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sr-only">
      <h2 id="rabbithole-demo-video-title">
        Rabbithole demo
      </h2>
      <p id="rabbithole-demo-video-description">
        Watch the product flow from the landing page into a personal encrypted vault.
      </p>
    </div>

    <div
      #playerHost
      class="relative aspect-video overflow-hidden rounded-md bg-black"
    >
      @if (playerWidth(); as width) {
        <youtube-player
          [videoId]="videoId"
          [width]="width"
          [height]="playerHeight()"
          [playerVars]="playerVars"
          disableCookies
          (stateChange)="handleStateChange($event)"
        />
      }
      @if (isPlaying()) {
        <div class="absolute inset-0 z-10"></div>
      }
    </div>
  `,
})
export class DemoVideoDialogComponent {
  readonly isPlaying = signal(false);
  readonly playerWidth = signal(0);
  readonly playerHeight = computed(() =>
    Math.round((this.playerWidth() * 9) / 16),
  );
  readonly playerVars = {
    controls: 0,
    iv_load_policy: 3,
    playsinline: 1,
    rel: 0,
  };
  readonly videoId = DEMO_VIDEO_ID;

  readonly #destroyRef = inject(DestroyRef);
  private readonly playerHost = viewChild<ElementRef<HTMLElement>>('playerHost');

  constructor() {
    afterNextRender(() => {
      const host = this.playerHost()?.nativeElement;
      if (!host) return;

      const syncSize = () => {
        this.playerWidth.set(
          Math.max(MIN_PLAYER_WIDTH, Math.round(host.clientWidth)),
        );
      };
      const observer = new ResizeObserver(syncSize);

      syncSize();
      observer.observe(host);
      this.#destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  handleStateChange(event: YT.OnStateChangeEvent): void {
    if (event.data === YOUTUBE_PLAYER_STATE.PLAYING) {
      this.isPlaying.set(true);
      return;
    }

    if (
      event.data === YOUTUBE_PLAYER_STATE.PAUSED ||
      event.data === YOUTUBE_PLAYER_STATE.ENDED
    ) {
      this.isPlaying.set(false);
    }
  }
}
