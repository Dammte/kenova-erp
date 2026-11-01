import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { DevicePicker } from "./DevicePicker";
import { EMPTY_DEVICE, type NewDevice } from "./intake";
import { ModelMatch } from "./modelMatch";

const BRANDS = [
  { id: "b1", name: "Apple" },
  { id: "b2", name: "Samsung" },
];
const MODELS = [
  {
    id: "m1",
    name: "iPhone 13",
    brandId: "b1",
    deviceType: "movil" as const,
    active: true,
  },
  {
    id: "m2",
    name: "iPad 9",
    brandId: "b1",
    deviceType: "tablet" as const,
    active: true,
  },
  {
    id: "m3",
    name: "iPhone 8",
    brandId: "b1",
    deviceType: "movil" as const,
    active: false,
  },
  {
    id: "m4",
    name: "Galaxy S23",
    brandId: "b2",
    deviceType: null,
    active: true,
  },
];
const match = new ModelMatch(BRANDS, MODELS);

describe("ModelMatch", () => {
  it("suggests the brand's models still in use", () => {
    expect(match.brandNames()).toEqual(["Apple", "Samsung"]);
    expect(match.modelNames("apple")).toEqual(["iPad 9", "iPhone 13"]);
    expect(match.modelNames("Nokia")).toEqual([]);
  });

  it("offers the catalogue's spelling of a look-alike, and nothing for an exact name", () => {
    expect(match.brandLookalike("APPLE ")).toBe("Apple");
    expect(match.brandLookalike("Apple")).toBeNull();
    expect(match.modelLookalike("apple", "iphone  13")).toBe("iPhone 13");
    expect(match.modelLookalike("Apple", "iPhone 13")).toBeNull();
    expect(match.modelLookalike("Apple", "iPhone 14")).toBeNull();
  });

  it("proposes the model's device type", () => {
    expect(match.typeOf("Apple", "ipad 9")).toBe("tablet");
    expect(match.typeOf("Samsung", "Galaxy S23")).toBeNull();
    expect(match.typeOf("Apple", "")).toBeNull();
  });
});

describe("DevicePicker with the catalogue", () => {
  const fetchMock = vi.fn();
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200 });
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) =>
      json(
        url.endsWith("/brands")
          ? BRANDS
          : url.endsWith("/models")
            ? MODELS
            : [],
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("picks the type of a known model and offers its spelling", async () => {
    let device: NewDevice = { ...EMPTY_DEVICE, brand: "Apple" };
    const onChange = vi.fn((d) => (device = d));
    const { rerender } = render(
      <DevicePicker clientId={null} value={device} onChange={onChange} />,
    );
    await act(async () => {});
    fireEvent.change(screen.getByLabelText(/^Modelo/), {
      target: { value: "ipad 9" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "ipad 9", type: "tablet" }),
    );
    rerender(
      <DevicePicker clientId={null} value={device} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Usar «iPad 9»" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: "iPad 9" }),
    );
  });
});
