import { describe, it, expect } from "vitest";
import { distanceMeters, nearestWorkplaces } from "./geolocation";

describe("distanceMeters", () => {
  it("is 0 for the same point", () => {
    expect(distanceMeters(55.6761, 12.5683, 55.6761, 12.5683)).toBeCloseTo(0, 3);
  });

  it("matches a known real-world straight-line distance (Rådhuspladsen to Nyhavn, ~1.46 km)", () => {
    const d = distanceMeters(55.6761, 12.5683, 55.6799, 12.5906);
    expect(d).toBeGreaterThan(1300);
    expect(d).toBeLessThan(1600);
  });
});

describe("nearestWorkplaces", () => {
  const workplaces = [
    { id: 1, name: "Butik A", lat: 55.6761, lng: 12.5683, radius_meters: 150 },
    { id: 2, name: "Butik B", lat: 55.6799, lng: 12.5906, radius_meters: 150 },
    { id: 3, name: "Ingen placering", lat: null, lng: null, radius_meters: 150 },
  ];

  it("excludes workplaces with no saved coordinates", () => {
    const result = nearestWorkplaces(55.6761, 12.5683, workplaces);
    expect(result.map((r) => r.workplaceId)).toEqual([1, 2]);
  });

  it("sorts nearest-first and flags whether within radius", () => {
    const result = nearestWorkplaces(55.6761, 12.5683, workplaces);
    expect(result[0].workplaceId).toBe(1);
    expect(result[0].withinRadius).toBe(true);
    expect(result[1].workplaceId).toBe(2);
    expect(result[1].withinRadius).toBe(false);
  });

  it("returns an empty list when no workplace has coordinates", () => {
    const result = nearestWorkplaces(55.6761, 12.5683, [{ id: 3, name: "Ingen placering", lat: null, lng: null, radius_meters: 150 }]);
    expect(result).toEqual([]);
  });
});
