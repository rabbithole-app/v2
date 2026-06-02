import { Injectable, signal, TemplateRef } from '@angular/core';

export interface PageHeaderRouteData {
  subtitle?: string;
  title?: string;
}

@Injectable({ providedIn: 'root' })
export class PageHeaderService {
  readonly #actionsTemplate = signal<TemplateRef<unknown> | null>(null);
  readonly actionsTemplate = this.#actionsTemplate.asReadonly();
  readonly #contextTemplate = signal<TemplateRef<unknown> | null>(null);
  readonly contextTemplate = this.#contextTemplate.asReadonly();

  readonly #subtitleOverride = signal<string | null>(null);
  readonly subtitleOverride = this.#subtitleOverride.asReadonly();
  readonly #titleOverride = signal<string | null>(null);
  readonly titleOverride = this.#titleOverride.asReadonly();

  setActionsTemplate(template: TemplateRef<unknown>): () => void {
    this.#actionsTemplate.set(template);

    return () => this.clearActionsTemplate(template);
  }

  setContextTemplate(template: TemplateRef<unknown>): () => void {
    this.#contextTemplate.set(template);

    return () => this.clearContextTemplate(template);
  }

  setSubtitle(subtitle: string | null): () => void {
    this.#subtitleOverride.set(subtitle);

    return () => this.clearSubtitle(subtitle);
  }

  setTitle(title: string | null): () => void {
    this.#titleOverride.set(title);

    return () => this.clearTitle(title);
  }

  private clearActionsTemplate(template: TemplateRef<unknown>): void {
    if (this.#actionsTemplate() === template) {
      this.#actionsTemplate.set(null);
    }
  }

  private clearContextTemplate(template: TemplateRef<unknown>): void {
    if (this.#contextTemplate() === template) {
      this.#contextTemplate.set(null);
    }
  }

  private clearSubtitle(subtitle: string | null): void {
    if (this.#subtitleOverride() === subtitle) {
      this.#subtitleOverride.set(null);
    }
  }

  private clearTitle(title: string | null): void {
    if (this.#titleOverride() === title) {
      this.#titleOverride.set(null);
    }
  }
}
