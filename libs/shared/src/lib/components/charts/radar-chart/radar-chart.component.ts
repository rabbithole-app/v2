import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { curveCardinalClosed, line } from 'd3-shape';

export interface RadarData {
  [key: string]: number;
}

@Component({
  selector: 'shared-radar-chart',
  imports: [],
  templateUrl: './radar-chart.component.html',
  styleUrl: './radar-chart.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RadarChartComponent {
  /** Computed angle slice for each axis */
  angleSlice = computed(() => {
    const keys = this.getXKeys();
    return keys.length > 0 ? (Math.PI * 2) / keys.length : 0;
  });

  /** Axis stroke color */
  axisStroke = input<string>('var(--border)');

  /** Axis stroke width */
  axisStrokeWidth = input<number>(1);

  /** SVG width */
  width = input.required<number>();

  /** Center X coordinate */
  centerX = computed(() => {
    return this.width() / 2;
  });

  /** SVG height */
  height = input.required<number>();

  /** Padding like in original ChartRadar */
  padding = input<{
    bottom: number;
    left: number;
    right: number;
    top: number;
  }>({
    bottom: 20,
    left: 0,
    right: 0,
    top: 30,
  });

  /** Center Y coordinate (with padding) */
  centerY = computed(() => {
    const h = this.height();
    const pad = this.padding();
    return (h - pad.top - pad.bottom) / 2 + pad.top;
  });

  /** Circle fill color */
  circleFill = input<string>('var(--color-primary)');

  /** Circle stroke color */
  circleStroke = input<string>('var(--color-primary-contrast)');

  /** Circle stroke width */
  circleStrokeWidth = input<number>(0);

  /** Data array for rendering */
  data = input.required<RadarData[]>();

  /** Fill color */
  fill = input<string>('var(--color-primary)');

  /** Fill opacity */
  fillOpacity = input<number>(0.25);

  /** Number of grid circles */
  gridLevels = input<number>(3);

  /** Grid stroke color */
  gridStroke = input<string>('var(--border)');

  /** Grid stroke width */
  gridStrokeWidth = input<number>(1);

  /** Label color */
  labelColor = input<string>('var(--muted-foreground)');

  /** Label font size */
  labelFontSize = input<string>('10px');

  /** Label placement factor (how far from center to place labels, like in original) */
  labelPlacementFactor = input<number>(1.25);

  /** Line length factor (how far to extend lines from center, like in original) */
  lineLengthFactor = input<number>(1.1);

  /** Computed maximum radius (like xRange in original: [0, height / 2]) */
  maxRadius = computed(() => {
    const h = this.height();
    const pad = this.padding();
    // xRange = [0, height / 2] in original
    return (h - pad.top - pad.bottom) / 2;
  });

  /** Computed maximum value across all data for normalization */
  maxValue = computed(() => {
    const dataRows = this.data();
    if (dataRows.length === 0) return 1;
    const keys = this.getXKeys();
    let max = 0;
    for (const row of dataRows) {
      for (const key of keys) {
        const value = row[key] ?? 0;
        if (typeof value === 'number' && value > max) {
          max = value;
        }
      }
    }
    return max > 0 ? max : 1;
  });

  /** Computed path generator function */
  path = computed(() => {
    const maxR = this.maxRadius();
    const maxVal = this.maxValue();
    return line<number>()
      .curve(curveCardinalClosed)
      .x((d, i) => {
        const angle = this.angleSlice() * i - Math.PI / 2;
        // Normalize value to 0-1 range, then scale to radius
        const normalizedValue = maxVal > 0 ? d / maxVal : 0;
        return normalizedValue * maxR * Math.cos(angle);
      })
      .y((d, i) => {
        const angle = this.angleSlice() * i - Math.PI / 2;
        // Normalize value to 0-1 range, then scale to radius
        const normalizedValue = maxVal > 0 ? d / maxVal : 0;
        return normalizedValue * maxR * Math.sin(angle);
      });
  });

  /** Point radius */
  r = input<number>(3.5);

  /** Stroke color */
  stroke = input<string>('var(--color-primary)');

  /** Stroke width */
  strokeWidth = input<number>(2);

  /** Function to extract values from data (default returns values in key order) */
  xGet = input<(row: RadarData) => number[]>((row) => {
    const keys = this.getXKeys();
    return keys.map((key) => {
      const value = row[key];
      return typeof value === 'number' ? value : 0;
    });
  });

  /** Array of keys for axes (defaults to first data row keys) */
  xKeys = input<string[]>([]);

  /** Get angle for a point */
  getAngle(i: number): number {
    return this.angleSlice() * i - Math.PI / 2;
  }

  /** Get axis end X coordinate (with lineLengthFactor like in original) */
  getAxisEndX(angle: number): number {
    const maxR = this.maxRadius();
    const factor = this.lineLengthFactor();
    return maxR * factor * Math.cos(angle);
  }

  /** Get axis end Y coordinate (with lineLengthFactor like in original) */
  getAxisEndY(angle: number): number {
    const maxR = this.maxRadius();
    const factor = this.lineLengthFactor();
    return maxR * factor * Math.sin(angle);
  }

  /** Get grid levels array for template (always 2 circles like in original) */
  getGridLevels(): number[] {
    return [1, 2];
  }

  /** Get grid circle radius for a level */
  getGridRadius(level: number): number {
    const maxR = this.maxRadius();
    // In original: one circle at max radius, one at half radius
    if (level === 1) {
      return maxR / 2;
    }
    return maxR;
  }

  /** Get label X coordinate */
  getLabelX(angle: number): number {
    const maxR = this.maxRadius();
    const factor = this.labelPlacementFactor();
    return maxR * factor * Math.cos(angle);
  }

  /** Get label Y coordinate */
  getLabelY(angle: number): number {
    const maxR = this.maxRadius();
    const factor = this.labelPlacementFactor();
    return maxR * factor * Math.sin(angle);
  }

  /** Get text anchor for label based on angle */
  getTextAnchor(i: number, total: number): string {
    if (i === 0 || i === total / 2) {
      return 'middle';
    }
    if (i < total / 2) {
      return 'start';
    }
    return 'end';
  }

  /** Get X coordinate for a point */
  getX(value: number, angle: number): number {
    const maxR = this.maxRadius();
    const maxVal = this.maxValue();
    // Normalize value to 0-1 range, then scale to radius
    const normalizedValue = maxVal > 0 ? value / maxVal : 0;
    return normalizedValue * maxR * Math.cos(angle);
  }

  /** Get keys for axes */
  getXKeys(): string[] {
    const keys = this.xKeys();
    if (keys.length > 0) {
      return keys;
    }
    const firstRow = this.data()[0];
    return firstRow ? Object.keys(firstRow) : [];
  }

  /** Get values for a data row */
  getXValues(row: RadarData): number[] {
    const keys = this.getXKeys();
    return keys.map((key) => {
      const value = row[key];
      return typeof value === 'number' ? value : 0;
    });
  }

  /** Get Y coordinate for a point */
  getY(value: number, angle: number): number {
    const maxR = this.maxRadius();
    const maxVal = this.maxValue();
    // Normalize value to 0-1 range, then scale to radius
    const normalizedValue = maxVal > 0 ? value / maxVal : 0;
    return normalizedValue * maxR * Math.sin(angle);
  }
}
