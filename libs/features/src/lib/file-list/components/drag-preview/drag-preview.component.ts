import {
  animate,
  AnimationBuilder,
  AnimationPlayer,
  group,
  keyframes,
  style,
} from '@angular/animations';
import { Point } from '@angular/cdk/drag-drop';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  OnDestroy,
  Renderer2,
} from '@angular/core';
import {
  NgIcon,
  provideNgIconLoader,
  provideNgIconsConfig,
  withCaching,
} from '@ng-icons/core';

import { FILE_LIST_ICONS_CONFIG } from '../../tokens';
import { NodeItem } from '../../types';
import { AnimatedFolderComponent } from '../animated-folder/animated-folder.component';

type FileMode = { extension: string; type: 'file' };
type FolderMode = { type: 'folder' };
type StackMode = { count: number; type: 'stack' };

@Component({
  selector: 'rbth-feat-file-list-drag-preview',
  templateUrl: './drag-preview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, AnimatedFolderComponent],
  providers: [
    provideNgIconsConfig({
      size: '32px',
    }),
    provideNgIconLoader((name) => {
      const http = inject(HttpClient);
      const config = inject(FILE_LIST_ICONS_CONFIG);
      return http.get(`/${config.path}${name}.svg`, { responseType: 'text' });
    }, withCaching()),
  ],
  host: {
    class:
      'inline-flex w-[60px] h-[60px] rounded-full bg-black/10 items-center justify-center absolute top-0 left-0 z-[1000] pointer-events-none',
  },
})
export class DragPreviewComponent implements OnDestroy {
  element = inject(ElementRef);
  selected = input.required<Partial<NodeItem>[]>();
  mode = computed<FileMode | FolderMode | StackMode>(() => {
    const selected = this.selected();
    const count = selected.length;
    if (count === 1 && selected[0]?.type === 'file') {
      const extension = this.getFileExtension(selected[0].name || '');
      return { type: 'file', extension };
    } else if (count === 1 && selected[0]?.type === 'directory') {
      return { type: 'folder' };
    }

    return { type: 'stack', count };
  });
  private readonly iconsConfig = inject(FILE_LIST_ICONS_CONFIG);
  iconName = computed(() => {
    const mode = this.mode();
    if (mode.type !== 'file') return 'unknown';

    const ext = mode.extension.toLowerCase();
    const config = this.iconsConfig.value;

    for (const [iconType, extensions] of Object.entries(config)) {
      if (extensions.includes(ext)) {
        return iconType;
      }
    }

    return 'unknown';
  });

  #animationBuilder = inject(AnimationBuilder);

  #renderer = inject(Renderer2);

  private readonly height: number = 60;
  private player!: AnimationPlayer;
  private readonly width: number = 60;

  /**
   * Функция анимирует host до точки point
   * вызывается с внешнего компонента к точке начала движения при отмене перетаскивания
   * (драг-элемент отпустили не на дроп-элементе)
   * @param point
   */
  animateToPoint(point: Point) {
    const animation = this.#animationBuilder.build([
      group([
        animate(
          '500ms ease-out',
          style({
            top: `${point.y - this.height / 2}px`,
            left: `${point.x - this.width / 2}px`,
          }),
        ),
        animate(
          '500ms linear',
          keyframes([
            style({ opacity: 1, offset: 0.5 }),
            style({ opacity: 0, offset: 1 }),
          ]),
        ),
      ]),
    ]);
    this.player = animation.create(this.element.nativeElement);
    this.player.play();
  }

  ngOnDestroy(): void {
    this.player?.destroy();
  }

  position(point: Point): void {
    this.#renderer.setStyle(
      this.element.nativeElement,
      'top',
      `${point.y - this.height / 2}px`,
    );
    this.#renderer.setStyle(
      this.element.nativeElement,
      'left',
      `${point.x - this.width / 2}px`,
    );
  }

  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot !== -1 ? filename.slice(lastDot + 1) : '';
  }
}
