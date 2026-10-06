import type { Cv } from "@janrau/schema/cv";
import siteData from "../generated/site-data.json" with { type: "json" };

/** The CV this Worker was built with: what staged variants are validated against. */
export const siteCv = (siteData as unknown as { cv: Cv }).cv;
