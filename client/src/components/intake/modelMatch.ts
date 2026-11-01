import { sameName, type DeviceType } from "@/components/catalog/catalog";

/** GET /api/brands and /api/models, as the intake reads them. */
export interface KnownBrand {
  id: string;
  name: string;
}
export interface KnownModel {
  id: string;
  name: string;
  brandId?: string | null;
  deviceType?: DeviceType | null;
  active?: boolean;
}

/**
 * Design R2 3.8 at intake: suggest the catalogue's names, propose the model's
 * device type, and warn before a look-alike («iphone 13») becomes a duplicate.
 */
export class ModelMatch {
  constructor(
    private readonly brands: KnownBrand[],
    private readonly models: KnownModel[],
  ) {}

  private brandOf(typed: string): KnownBrand | undefined {
    const key = sameName(typed);
    return key ? this.brands.find((b) => sameName(b.name) === key) : undefined;
  }

  private modelsOf(brand: string): KnownModel[] {
    const b = this.brandOf(brand);
    return b ? this.models.filter((m) => m.brandId === b.id) : [];
  }

  /** Brand names to pick from. */
  brandNames(): string[] {
    return this.brands
      .map((b) => b.name)
      .sort((a, b) => a.localeCompare(b, "es"));
  }

  /** The brand's models still in use, to pick from. */
  modelNames(brand: string): string[] {
    return this.modelsOf(brand)
      .filter((m) => m.active !== false)
      .map((m) => m.name)
      .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  }

  /** The catalogue's spelling of a brand typed differently, if any. */
  brandLookalike(typed: string): string | null {
    const b = this.brandOf(typed);
    return b && b.name !== typed.trim() ? b.name : null;
  }

  private modelOf(brand: string, typed: string): KnownModel | undefined {
    const key = sameName(typed);
    if (!key) return undefined;
    const same = this.modelsOf(brand).filter((m) => sameName(m.name) === key);
    // When duplicates exist, the one still in use wins.
    return same.find((m) => m.active !== false) ?? same[0];
  }

  /** The catalogue's spelling of a model typed differently, if any. */
  modelLookalike(brand: string, typed: string): string | null {
    const m = this.modelOf(brand, typed);
    return m && m.name !== typed.trim() ? m.name : null;
  }

  /** The device type the catalogue proposes for this model. */
  typeOf(brand: string, model: string): DeviceType | null {
    return this.modelOf(brand, model)?.deviceType ?? null;
  }
}
